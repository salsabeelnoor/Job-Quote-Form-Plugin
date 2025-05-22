jQuery(document).ready(function ($) {
    console.log('JPM Script: Document ready. Multi-file strategy. Listen on uc-upload-ctx-provider. No UI filename display.');

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
        // Exclude uc-form-input (handled in step 5) and our specific hidden input for filenames
        $fitting.find('[name*="fields[fittings]"]').not('uc-form-input, .original-filenames-json').each(function () {
            const $input = $(this);
            // If this input is INSIDE uc-form-input, it's managed by Uploadcare
            if ($input.closest('uc-form-input').length) return;

            const currentName = $input.attr("name");
            if (currentName && (currentName.includes('[__INDEX__]') || /\['\d+'\]|\[\d+\]/.test(currentName))) {
                const newName = currentName.replace(/\[__INDEX__\]|\[\d+\]/, "[" + index + "]");
                $input.attr("name", newName);
            }
        });

        // 4. Update IDs and corresponding label 'for' attributes
        // Exclude uc-form-input's inner input and our hidden filename input from generic ID updates
        // if their IDs are also tied to ctx-name or a specific pattern
        $fitting.find('input:not(uc-form-input input):not(.original-filenames-json), select, textarea').each(function() {
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
        
        // Update name for the custom hidden input for original filenames JSON
        const $hiddenFilenamesInput = $fitting.find('.original-filenames-json');
        if ($hiddenFilenamesInput.length) {
            let currentName = $hiddenFilenamesInput.attr('name');
            if (currentName && currentName.includes('__INDEX__')) {
                const newName = currentName.replace(/__INDEX__/g, index.toString());
                $hiddenFilenamesInput.attr('name', newName);
            }
        }


        // 5. Initialize Uploadcare Component ATTRIBUTES (ctx-name primarily)
        const uniqueCtxNameForFitting = `jpm-photo-uploader-${index}`;
        $fitting.find('uc-config, uc-upload-ctx-provider, uc-file-uploader-regular, uc-form-input').each(function() {
            const $ucElement = $(this);
            const rawDomElement = this;
            let currentCtxNameAttr = $ucElement.attr('ctx-name');
            let finalCtxName = uniqueCtxNameForFitting; 

            if (currentCtxNameAttr && currentCtxNameAttr.includes('__INDEX__')) {
                finalCtxName = currentCtxNameAttr.replace(/__INDEX__/g, index.toString());
            }
            // No complex logic for existing ctx-name if templates are consistent with __INDEX__
            // The goal is to ensure each instance has a unique, indexed ctx-name.
            
            $ucElement.attr('ctx-name', finalCtxName);
            if (rawDomElement.style && typeof rawDomElement.style.setProperty === 'function') {
                rawDomElement.style.setProperty('--ctx-name', `'${finalCtxName}'`);
            }

            if ($ucElement.is('uc-form-input')) {
                // The name on the host <uc-form-input> will be used by PHP if Uploadcare
                // doesn't automatically make its internal CTX_NAME[] inputs part of that submission key.
                // Based on your demo, FormData picks up CTX_NAME[] directly.
                // This host name is `fields[fittings][${index}][photo]`
                const hostNameForUrl = `fields[fittings][${index}][photo]`;
                $ucElement.attr('name', hostNameForUrl); 

                // We are NOT manually setting the name of the inner hidden inputs generated by Uploadcare.
                // Uploadcare creates them with name="CTX_NAME[]" when multiple="true".
                // form-submission.js is already designed to pick these CTX_NAME[] up.
            }
        });
    } // End of initializeFittingAttributes

    // --- Function: attachUploadcareListeners ---
    function attachUploadcareListeners(fittingElement, index) {
        const $fitting = $(fittingElement);
        const uploaderCtxName = `jpm-photo-uploader-${index}`;
        const $ctxProvider = $fitting.find(`uc-upload-ctx-provider[ctx-name="${uploaderCtxName}"]`);
        const $hiddenOriginalFilenamesJsonInput = $fitting.find('.original-filenames-json');

        console.log(`JPM Script: attachUploadcareListeners for index ${index}. Provider: ${$ctxProvider.length}, HiddenInput: ${$hiddenOriginalFilenamesJsonInput.length}`);

        if ($ctxProvider.length && $hiddenOriginalFilenamesJsonInput.length) {
            const ctxProviderDOMElement = $ctxProvider[0];

            if (!$(ctxProviderDOMElement).data('jpm-ctx-multi-listener-attached')) {
                console.log(`JPM Script: Attaching 'change' listener to uc-upload-ctx-provider [ctx-name="${uploaderCtxName}"] for index ${index}`);

                // Using 'change' event on uc-upload-ctx-provider, which gives OutputCollectionState
                ctxProviderDOMElement.addEventListener('change', function(event) {
                    console.log(`JPM Script: UPLOADCARE 'change' (OutputCollectionState) EVENT for index ${index}. Detail:`, event.detail);
                    const collectionState = event.detail;
                    let filenamesArray = [];

                    if (collectionState && collectionState.allEntries) {
                        const successfulEntries = collectionState.allEntries.filter(
                            entry => entry.status === 'success' || (entry.isSuccess && entry.cdnUrl)
                        );

                        successfulEntries.forEach(fileInfo => {
                            if (fileInfo && fileInfo.cdnUrl) { // Ensure there's a cdnUrl, indicating it's processed
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
                                    determinedFilename = `uploaded_file_${Date.now()}_${filenamesArray.length}`;
                                }
                                filenamesArray.push(determinedFilename);
                            }
                        });
                    }

                    $hiddenOriginalFilenamesJsonInput.val(JSON.stringify(filenamesArray));
                    console.log(`JPM Script: Fitting Index ${index} ('change' event): Filenames JSON set: ${JSON.stringify(filenamesArray)}`);
                });
                
                $(ctxProviderDOMElement).data('jpm-ctx-multi-listener-attached', true);
            }
        } else {
            if (!$ctxProvider.length) console.warn(`JPM Script: Could not find uc-upload-ctx-provider with ctx-name="${uploaderCtxName}" for index ${index}.`);
            if (!$hiddenOriginalFilenamesJsonInput.length) console.warn(`JPM Script: Could not find .original-filenames-json for index ${index}.`);
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
        // console.log('JPM Script: addFittingSection called.');

        const newIndex = fittingCount;
        const $newFitting = $(fittingTemplateHTML);
        const newFittingElement = $newFitting[0];

        initializeFittingAttributes(newFittingElement, newIndex);

        const $lastFitting = fittingsContainer.children(".form-section.fitting-fields").last();
        if ($lastFitting.length) {
            $newFitting.insertAfter($lastFitting);
        } else {
            fittingsContainer.append($newFitting);
        }
        fittingCount++;

        setTimeout(() => {
            attachUploadcareListeners(newFittingElement, newIndex);
        }, 100); 

        $("html, body").animate({ scrollTop: $newFitting.offset().top - 100 }, 500);
    }

    // --- Function: updateAllFittingSections (For initial page load ONLY) ---
    function updateAllFittingSections() {
        // console.log('JPM Script: updateAllFittingSections called for initial page load.');
        let currentDomIndex = 0;
        fittingsContainer.children(".form-section.fitting-fields").each(function () {
            const currentFittingElement = this;
            const indexForListener = parseInt($(currentFittingElement).attr('data-fitting-index'), 10); 
            initializeFittingAttributes(currentFittingElement, indexForListener);
            setTimeout(() => { 
                attachUploadcareListeners(currentFittingElement, indexForListener);
            }, 100);
            currentDomIndex++; 
        });
        fittingCount = currentDomIndex;
    }

    // --- Event Handlers ---
    $(document).on("click", ".add-another-fitting-button", addFittingSection);

    $(document).on('jpmFormResettedForRepeater', function() {
        // console.log('JPM Script: jpmFormResettedForRepeater event triggered.');
        const $firstFittingItem = fittingsContainer.children('.form-section.fitting-fields').first();
        if ($firstFittingItem.length) {
            const firstFittingElement = $firstFittingItem[0];
            initializeFittingAttributes(firstFittingElement, 0);
            
            const ctxProviderInFirst = firstFittingElement.querySelector(`uc-upload-ctx-provider[ctx-name="jpm-photo-uploader-0"]`);
            if (ctxProviderInFirst) {
                 $(ctxProviderInFirst).removeData('jpm-ctx-multi-listener-attached');
            }
            setTimeout(() => {
                attachUploadcareListeners(firstFittingElement, 0);
            }, 100);

            $firstFittingItem.find('.original-filenames-json').val('');
            // $firstFittingItem.find('.image-names-0').html('').hide(); // REMOVED: UI display div is gone
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
    const $initialFittingGroup = $(".fitting-field-group").first();
    if ($initialFittingGroup.length) {
        $initialFittingGroup.removeClass("fitting-field-group").addClass("form-section fitting-fields");
        fittingsContainer.append($initialFittingGroup);
    }
    updateAllFittingSections();
});