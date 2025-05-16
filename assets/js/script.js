jQuery(document).ready(function ($) {
    console.log('JPM Script: Document ready. Strategy: Listen on uc-upload-ctx-provider.');

    // --- Element References ---
    const fittingsContainer = $("#fittings-container");
    const initialOperatorNameField = $("#operator_name");
    const initialAddressOfUnitField = $("#address_of_unit");

    // --- Localized Data ---
    const fittingTemplateHTML = (typeof jpmJQForm !== 'undefined' && jpmJQForm.add_fitting_template)
                                ? jpmJQForm.add_fitting_template
                                : '<p>Error: Fitting template not found. Cannot add new fittings.</p>';

    if (fittingTemplateHTML.includes('Error: Fitting template not found.')) {
        console.error('JPM Script: ERROR - Fitting template HTML is missing.');
    }

    // --- State Variable ---
    let fittingCount = 0;

    // --- Function: initializeFittingAttributes ---
    // Sets all HTML attributes for a given fitting section and its Uploadcare components.
    // Called BEFORE the element is appended to the live DOM when adding new fittings.
    function initializeFittingAttributes(fittingElement, index) {
        const $fitting = $(fittingElement);
        console.log(`JPM Script: initializeFittingAttributes for index: ${index}`);

        // 1. Update visual fitting number and data attribute
        let $numberSpan = $fitting.find(".fitting-number");
        if (!$numberSpan.length) $numberSpan = $fitting.find(".fitting-number-initial");
        $numberSpan.text(index + 1);
        $fitting.attr("data-fitting-index", index);

        // 2. Populate read-only operator/address fields (if templated)
        if ($fitting.find(".readonly-operator-name").length) {
            updateFittingWithOperatorAndAddress($fitting);
        }

        // 3. Update 'name' attributes for general form inputs
        $fitting.find('[name*="fields[fittings]"]').not('uc-form-input').each(function () {
            const $input = $(this);
            if ($input.closest('uc-form-input').length) return;
            const currentName = $input.attr("name");
            if (currentName && (currentName.includes('[__INDEX__]') || /\['\d+'\]|\[\d+\]/.test(currentName))) {
                const newName = currentName.replace(/\[__INDEX__\]|\[\d+\]/, "[" + index + "]");
                $input.attr("name", newName);
            }
        });

        // 4. Update IDs and corresponding label 'for' attributes
        $fitting.find('input:not(uc-form-input input), select, textarea').each(function() {
            const $el = $(this);
            const currentId = $el.attr('id');
            if (currentId && currentId.includes('__INDEX__')) {
                const newId = currentId.replace(/__INDEX__/g, index.toString());
                $('label[for="' + currentId + '"]').attr('for', newId);
                $el.attr('id', newId);
            } else if (currentId && currentId.match(/_\d+$/) && index > 0) {
                const newId = currentId.replace(/_\d+$/, "_" + index);
                $('label[for="' + currentId + '"]').attr('for', newId);
                $el.attr('id', newId);
            }
        });

        // 5. Initialize Uploadcare Component ATTRIBUTES (ctx-name primarily)
        // This includes uc-config, uc-upload-ctx-provider, uc-file-uploader-regular, uc-form-input
        const uniqueCtxNameForFitting = `jpm-photo-uploader-${index}`;

        $fitting.find('uc-config, uc-upload-ctx-provider, uc-file-uploader-regular, uc-form-input').each(function() {
            const $ucElement = $(this);
            const rawDomElement = this;
            let currentCtxNameAttr = $ucElement.attr('ctx-name');
            let finalCtxName = uniqueCtxNameForFitting; // Default to the generated one

            if (currentCtxNameAttr && currentCtxNameAttr.includes('__INDEX__')) {
                finalCtxName = currentCtxNameAttr.replace(/__INDEX__/g, index.toString());
            }
            // If currentCtxNameAttr exists but doesn't have __INDEX__ (e.g. from first item),
            // we ensure it's updated to the correct index-based name if it's not already.
            else if (currentCtxNameAttr && currentCtxNameAttr !== finalCtxName) {
                // This case is less likely if templates always use __INDEX__ for dynamic parts
                // but handles re-initialization or initial item processing.
                 // $ucElement.attr('ctx-name', finalCtxName); // Already handled by default assignment
            } else if (!currentCtxNameAttr) { // If no ctx-name at all (should not happen for template items)
                // $ucElement.attr('ctx-name', finalCtxName); // Already handled
                console.warn(`JPM Script: Element ${rawDomElement.tagName} had no ctx-name, set to: ${finalCtxName}`);
            }


            $ucElement.attr('ctx-name', finalCtxName);
            if (rawDomElement.style && typeof rawDomElement.style.setProperty === 'function') {
                rawDomElement.style.setProperty('--ctx-name', `'${finalCtxName}'`);
            }

            if ($ucElement.is('uc-form-input')) {
                const phpExpectedNameForUrl = `fields[fittings][${index}][photo]`;
                $ucElement.attr('name', phpExpectedNameForUrl); 

                let $innerInput = $ucElement.find('input[type="text"], input[type="hidden"]');
                if ($innerInput.length) {
                    $innerInput.first().attr('name', finalCtxName); // Inner <input> name matches its context name
                }
            }
        });
    } // End of initializeFittingAttributes

    // --- Function: attachUploadcareListeners ---
    // Attaches event listeners to the uc-upload-ctx-provider for this fitting.
    function attachUploadcareListeners(fittingElement, index) {
        const $fitting = $(fittingElement);
        const uploaderCtxName = `jpm-photo-uploader-${index}`;
        // Find the PROVIDER specific to this fitting's context
        const $ctxProvider = $fitting.find(`uc-upload-ctx-provider[ctx-name="${uploaderCtxName}"]`);
        const $hiddenOriginalFilenameInput = $fitting.find('.original-filename-input');

        console.log(`JPM Script: attachUploadcareListeners for index ${index}. Provider found: ${$ctxProvider.length}, HiddenInput: ${$hiddenOriginalFilenameInput.length}`);

        if ($ctxProvider.length && $hiddenOriginalFilenameInput.length) {
            const ctxProviderDOMElement = $ctxProvider[0];

            if (!$(ctxProviderDOMElement).data('jpm-ctx-listener-attached')) {
                console.log(`JPM Script: Attaching listeners to uc-upload-ctx-provider [ctx-name="${uploaderCtxName}"] for index ${index}`);

                const handleFileUploadSuccess = function(event) {
                    console.log(`JPM Script: UPLOADCARE 'file-upload-success' EVENT for fitting index ${index}. Detail:`, event.detail);
                    const fileInfo = event.detail; // event.detail IS the OutputFileEntry for this event

                    if (fileInfo && fileInfo.cdnUrl) { // isSuccess and status might not be on OutputFileEntry directly but inferred
                        let determinedFilename = fileInfo.name || fileInfo.originalFilename;
                        if (!determinedFilename && fileInfo.uuid) {
                            let extension = '';
                            const mimeType = fileInfo.mimeType;
                            if (mimeType) {
                                if (mimeType === 'image/jpeg' || mimeType === 'image/jpg') extension = '.jpg';
                                else if (mimeType === 'image/png') extension = '.png';
                                else if (mimeType === 'image/webp') extension = '.webp';
                                else {
                                    const parts = mimeType.split('/');
                                    if (parts.length > 1 && parts[1].length > 0 && parts[1].length <= 5 && /^[a-z0-9.+-]+$/.test(parts[1])) {
                                        extension = '.' + parts[1].replace('vnd.openxmlformats-officedocument.wordprocessingml.', '');
                                    }
                                }
                            }
                            determinedFilename = `file_${fileInfo.uuid.substring(0, 8)}${extension}`;
                        } else if (!determinedFilename) {
                            determinedFilename = `uploaded_file_${Date.now()}`;
                        }
                        console.log(`JPM Script: Fitting Index ${index} ('file-upload-success'): Filename to set: "${determinedFilename}"`);
                        $hiddenOriginalFilenameInput.val(determinedFilename);
                    } else {
                        console.log(`JPM Script: Fitting Index ${index} ('file-upload-success'): No usable fileInfo or cdnUrl. FileInfo:`, fileInfo);
                    }
                };

                const handleFileRemoved = function(event) {
                    console.log(`JPM Script: UPLOADCARE 'file-removed' EVENT for fitting index ${index}. Detail:`, event.detail);
                    // Check if the removed file matches the current context, if needed, though a general clear is fine
                    $hiddenOriginalFilenameInput.val('');
                    console.log(`JPM Script: Fitting Index ${index}: Filename input cleared due to file-removed.`);
                };
                
                // const handleChangeEvent = function(event) {
                //      console.log(`JPM Script: UPLOADCARE 'change' (collection state) EVENT for fitting index ${index}. Detail:`, event.detail);
                //      // event.detail here is OutputCollectionState. You might iterate event.detail.allEntries
                //      // or event.detail.successEntries to find the relevant file by UUID if needed.
                //      // This event is more general for the state of the whole uploader instance.
                //      const collectionState = event.detail;
                //      if (collectionState && collectionState.allEntries && collectionState.allEntries.length > 0) {
                //          const lastEntry = collectionState.allEntries[collectionState.allEntries.length - 1];
                //          if (lastEntry.status === 'success' && lastEntry.isSuccess) {
                //              // Potentially redundant if file-upload-success also fires with similar data
                //          }
                //      } else if (collectionState && collectionState.allEntries && collectionState.allEntries.length === 0) {
                //          $hiddenOriginalFilenameInput.val('');
                //      }
                // };

                ctxProviderDOMElement.addEventListener('file-upload-success', handleFileUploadSuccess);
                ctxProviderDOMElement.addEventListener('file-removed', handleFileRemoved);
                // ctxProviderDOMElement.addEventListener('change', handleChangeEvent);


                $(ctxProviderDOMElement).data('jpm-ctx-listener-attached', true);
                console.log(`JPM Script: Listeners (file-upload-success, file-removed) ATTACHED to uc-upload-ctx-provider for index ${index}`);
            } else {
                // console.log(`JPM Script: Listeners ALREADY ATTACHED for provider index ${index}`);
            }
        } else {
            console.warn(`JPM Script: Could not find uc-upload-ctx-provider with ctx-name="${uploaderCtxName}" or hidden input for index ${index} to attach listeners.`);
        }
    } // End of attachUploadcareListeners

    // --- Function: updateFittingWithOperatorAndAddress ---
    function updateFittingWithOperatorAndAddress($fitting) {
        const operatorNameValue = initialOperatorNameField.val();
        const addressValue = initialAddressOfUnitField.val();
        $fitting.find(".readonly-operator-name").val(operatorNameValue);
        $fitting.find(".readonly-address-of-unit").val(addressValue);
    }

    // --- Function: addFittingSection ---
    function addFittingSection(event) {
        if (event) event.preventDefault();
        if (fittingTemplateHTML.includes('Error: Fitting template not found.')) {
            alert('Cannot add fitting: Template data is missing.'); return;
        }
        console.log('JPM Script: addFittingSection called.');

        const newIndex = fittingCount;
        const $newFitting = $(fittingTemplateHTML);
        const newFittingElement = $newFitting[0];

        initializeFittingAttributes(newFittingElement, newIndex); // Set attributes BEFORE append

        const $lastFitting = fittingsContainer.children(".form-section.fitting-fields").last();
        if ($lastFitting.length) {
            $newFitting.insertAfter($lastFitting);
        } else {
            fittingsContainer.append($newFitting);
        }
        fittingCount++;

        setTimeout(() => {
            // console.log(`JPM Script: Calling attachUploadcareListeners for new fitting index ${newIndex} inside setTimeout.`);
            attachUploadcareListeners(newFittingElement, newIndex);
        }, 100); 

        $("html, body").animate({ scrollTop: $newFitting.offset().top - 100 }, 500);
    }

    // --- Function: updateAllFittingSections (For initial page load ONLY) ---
    function updateAllFittingSections() {
        console.log('JPM Script: updateAllFittingSections called for initial page load.');
        let currentDomIndex = 0;
        fittingsContainer.children(".form-section.fitting-fields").each(function () {
            const currentFittingElement = this;
            // The index should be on the element itself from the PHP rendering (data-fitting-index="0")
            // or from when it was added dynamically.
            const indexForListener = parseInt($(currentFittingElement).attr('data-fitting-index'), 10); 

            initializeFittingAttributes(currentFittingElement, indexForListener);
            setTimeout(() => { 
                attachUploadcareListeners(currentFittingElement, indexForListener);
            }, 100);
            currentDomIndex++; // This counts how many are processed, fittingCount will be set to this.
        });
        fittingCount = currentDomIndex;
        console.log('JPM Script: Initial page setup - fittingCount set to:', fittingCount);
    }

    // --- Event Handlers ---
    $(document).on("click", ".add-another-fitting-button", addFittingSection);

    $(document).on('jpmFormResettedForRepeater', function() {
        console.log('JPM Script: jpmFormResettedForRepeater event triggered.');
        const $firstFittingItem = fittingsContainer.children('.form-section.fitting-fields').first();
        if ($firstFittingItem.length) {
            const firstFittingElement = $firstFittingItem[0];
            initializeFittingAttributes(firstFittingElement, 0);
            
            const ctxProviderInFirst = firstFittingElement.querySelector(`uc-upload-ctx-provider[ctx-name="jpm-photo-uploader-0"]`);
            if (ctxProviderInFirst) {
                 $(ctxProviderInFirst).removeData('jpm-ctx-listener-attached');
            }
            setTimeout(() => {
                attachUploadcareListeners(firstFittingElement, 0);
            }, 100);

            $firstFittingItem.find('.original-filename-input').val('');
            fittingCount = 1;
        } else {
            fittingCount = 0;
        }
    });

    initialOperatorNameField.on('input', function () {
         fittingsContainer.children(".form-section.fitting-fields").each(function () {
            updateFittingWithOperatorAndAddress($(this));
        });
    });
    initialAddressOfUnitField.on('input', function () {
         fittingsContainer.children(".form-section.fitting-fields").each(function () {
            updateFittingWithOperatorAndAddress($(this));
        });
    });

    // --- Initial Setup on Page Load ---
    console.log('JPM Script: Starting Initial Setup...');
    const $initialFittingGroup = $(".fitting-field-group").first();
    if ($initialFittingGroup.length) {
        $initialFittingGroup.removeClass("fitting-field-group").addClass("form-section fitting-fields");
        fittingsContainer.append($initialFittingGroup);
    }

    updateAllFittingSections();

    console.log('JPM Script: Initial Setup Finished.');
});