jQuery(document).ready(function ($) {
    console.log('JPM Script: Document ready. Final multi-file & readonly fields strategy.');

    // --- Element References ---
    const fittingsContainer = $("#fittings-container");
    const initialOperatorNameField = $("#operator_name");
    const initialAddressOfUnitField = $("#address_of_unit");
    const firstFittingSizeInput = $('#fitting_size_of_unit_0');
    const firstFittingUnitSelect = $('#fitting_unit_of_measurement_0');

    // --- Localized Data ---
    const fittingTemplateHTML = (typeof jpmJQForm !== 'undefined' && jpmJQForm.add_fitting_template)
                                ? jpmJQForm.add_fitting_template
                                : '<p>Error: Fitting template not found. Cannot add new fittings.</p>';

    if (fittingTemplateHTML.includes('Error: Fitting template not found.')) {
        console.error('JPM Script: ERROR - Fitting template HTML is missing.');
    }

    // --- State Variables ---
    let fittingCount = 0;
    let cachedInitialSizeOfUnit = '';
    let cachedInitialUnitOfMeasurementValue = '';
    let cachedInitialUnitOfMeasurementText = '';

    // --- Function: cacheFirstFittingValues ---
    function cacheFirstFittingValues() {
        cachedInitialSizeOfUnit = firstFittingSizeInput.val();
        cachedInitialUnitOfMeasurementValue = firstFittingUnitSelect.val();
        cachedInitialUnitOfMeasurementText = firstFittingUnitSelect.find('option:selected').text();
        if (cachedInitialUnitOfMeasurementText === firstFittingUnitSelect.find('option[value=""]').text() || cachedInitialUnitOfMeasurementValue === "") {
            cachedInitialUnitOfMeasurementText = ''; // Don't display placeholder like "-- Select Unit --"
        }
        // console.log('JPM Script: Cached first fitting values:', cachedInitialSizeOfUnit, cachedInitialUnitOfMeasurementValue, `(${cachedInitialUnitOfMeasurementText})`);
    }

    // --- Function: updateFittingGlobalReadonlyFields ---
    function updateFittingGlobalReadonlyFields($fitting) {
        // Size of Unit (for dynamic fittings)
        $fitting.find(".readonly-size-of-unit").val(cachedInitialSizeOfUnit);
        // Unit of Measurement (for dynamic fittings)
        $fitting.find(".readonly-unit-of-measurement-text").val(cachedInitialUnitOfMeasurementText);
        $fitting.find(".hidden-unit-of-measurement").val(cachedInitialUnitOfMeasurementValue);
    }

    // --- Function: updateFittingWithOperatorAndAddress (Helper) ---
    function updateFittingWithOperatorAndAddress($fitting) {
        $fitting.find(".readonly-operator-name").val(initialOperatorNameField.val());
        $fitting.find(".readonly-address-of-unit").val(initialAddressOfUnitField.val());
    }


    // --- Function: initializeFittingAttributes ---
    function initializeFittingAttributes(fittingElement, index) {
        const $fitting = $(fittingElement);
        // console.log(`JPM Script: initializeFittingAttributes for index: ${index}`);

        // 1. Update visual fitting number and data attribute
        let $numberSpan = $fitting.find(".fitting-number");
        if (!$numberSpan.length) $numberSpan = $fitting.find(".fitting-number-initial");
        $numberSpan.text(index + 1);
        $fitting.attr("data-fitting-index", index);

        // 2. Populate read-only fields
        if (index > 0) { // For dynamically added fittings (index 1 and up)
            updateFittingGlobalReadonlyFields($fitting); // Handles size and unit
            updateFittingWithOperatorAndAddress($fitting); // Handles operator and address
        } else { // For the first fitting (index 0)
             if ($fitting.find(".readonly-operator-name").length) { // This should only be in template, not first item
                updateFittingWithOperatorAndAddress($fitting);
            }
        }

        // 3. Update 'name' attributes for general editable form inputs
        $fitting.find('[name*="fields[fittings]"]')
            .not('uc-form-input, .original-filenames-json, .readonly-size-of-unit, .readonly-unit-of-measurement-text, .hidden-unit-of-measurement')
            .each(function () {
                const $input = $(this);
                if ($input.closest('uc-form-input').length) return;
                const currentName = $input.attr("name");
                if (currentName && (currentName.includes('[__INDEX__]') || /\['\d+'\]|\[\d+\]/.test(currentName))) {
                    const newName = currentName.replace(/\[__INDEX__\]|\[\d+\]/, "[" + index + "]");
                    $input.attr("name", newName);
                }
            });

        // 4. Update IDs and corresponding label 'for' attributes (for non-UC elements)
        $fitting.find('input:not(uc-form-input input):not(.original-filenames-json):not(.readonly-size-of-unit):not(.readonly-unit-of-measurement-text):not(.hidden-unit-of-measurement), select:not(#fitting_unit_of_measurement_0), textarea').each(function() {
            const $el = $(this);
            const currentId = $el.attr('id');
            if (currentId && currentId.includes('__INDEX__')) {
                const newId = currentId.replace(/__INDEX__/g, index.toString());
                if (!$el.closest('uc-file-uploader-regular').length) {
                    $('label[for="' + currentId + '"]').attr('for', newId);
                }
                $el.attr('id', newId);
            } else if (currentId && currentId.match(/_\d+$/) && index > 0) {
                const newId = currentId.replace(/_\d+$/, "_" + index);
                 if (!$el.closest('uc-file-uploader-regular').length) {
                    $('label[for="' + currentId + '"]').attr('for', newId);
                }
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

        // Update names for readonly size_of_unit and hidden unit_of_measurement if template uses __INDEX__
        const $sizeInputReadonly = $fitting.find('.readonly-size-of-unit');
        if ($sizeInputReadonly.length) {
            let currentName = $sizeInputReadonly.attr('name');
            if (currentName && currentName.includes('__INDEX__')) {
                const newName = currentName.replace(/__INDEX__/g, index.toString());
                $sizeInputReadonly.attr('name', newName);
            }
        }
        const $hiddenUnitInput = $fitting.find('.hidden-unit-of-measurement');
        if ($hiddenUnitInput.length) {
            let currentName = $hiddenUnitInput.attr('name');
            if (currentName && currentName.includes('__INDEX__')) {
                const newName = currentName.replace(/__INDEX__/g, index.toString());
                $hiddenUnitInput.attr('name', newName);
            }
        }

        // 5. Initialize Uploadcare Component ATTRIBUTES (ctx-name)
        const uniqueCtxNameForFitting = `jpm-photo-uploader-${index}`;
        $fitting.find('uc-config, uc-upload-ctx-provider, uc-file-uploader-regular, uc-form-input').each(function() {
            const $ucElement = $(this);
            const rawDomElement = this;
            let currentCtxNameAttr = $ucElement.attr('ctx-name');
            let finalCtxName = uniqueCtxNameForFitting; 

            if (currentCtxNameAttr && currentCtxNameAttr.includes('__INDEX__')) {
                finalCtxName = currentCtxNameAttr.replace(/__INDEX__/g, index.toString());
            }
            
            $ucElement.attr('ctx-name', finalCtxName);
            if (rawDomElement.style && typeof rawDomElement.style.setProperty === 'function') {
                rawDomElement.style.setProperty('--ctx-name', `'${finalCtxName}'`);
            }

            if ($ucElement.is('uc-form-input')) {
                const hostNameForUrl = `fields[fittings][${index}][photo]`; // Name PHP expects for URL(s)
                $ucElement.attr('name', hostNameForUrl); 
                // Uploadcare will create inner inputs like name="jpm-photo-uploader-X[]" for FormData
            }
        });
    } // End of initializeFittingAttributes

    // --- Function: attachUploadcareListeners ---
    function attachUploadcareListeners(fittingElement, index) {
        const $fitting = $(fittingElement);
        const uploaderCtxName = `jpm-photo-uploader-${index}`;
        const $ctxProvider = $fitting.find(`uc-upload-ctx-provider[ctx-name="${uploaderCtxName}"]`);
        const $hiddenOriginalFilenamesJsonInput = $fitting.find('.original-filenames-json');

        // console.log(`JPM Script: attachUploadcareListeners for index ${index}. Provider: ${$ctxProvider.length}, HiddenInput: ${$hiddenOriginalFilenamesJsonInput.length}`);

        if ($ctxProvider.length && $hiddenOriginalFilenamesJsonInput.length) {
            const ctxProviderDOMElement = $ctxProvider[0];

            if (!$(ctxProviderDOMElement).data('jpm-ctx-multi-listener-attached')) {
                // console.log(`JPM Script: Attaching 'change' listener to uc-upload-ctx-provider [ctx-name="${uploaderCtxName}"] for index ${index}`);

                ctxProviderDOMElement.addEventListener('change', function(event) {
                    // console.log(`JPM Script: UPLOADCARE 'change' (OutputCollectionState) EVENT for index ${index}. Detail:`, event.detail);
                    const collectionState = event.detail;
                    let filenamesArray = [];

                    if (collectionState && collectionState.allEntries) {
                        const successfulEntries = collectionState.allEntries.filter(
                            entry => entry.status === 'success' || (entry.isSuccess && entry.cdnUrl)
                        );

                        successfulEntries.forEach(fileInfo => {
                            if (fileInfo && fileInfo.cdnUrl) {
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
                    // console.log(`JPM Script: Fitting Index ${index} ('change' event): Filenames JSON set: ${JSON.stringify(filenamesArray)}`);
                });
                $(ctxProviderDOMElement).data('jpm-ctx-multi-listener-attached', true);
            }
        } else {
            if (!$ctxProvider.length) console.warn(`JPM Script: Could not find uc-upload-ctx-provider with ctx-name="${uploaderCtxName}" for index ${index}.`);
            if (!$hiddenOriginalFilenamesJsonInput.length) console.warn(`JPM Script: Could not find .original-filenames-json for index ${index}.`);
        }
    } // End of attachUploadcareListeners

    // --- Function: addFittingSection ---
    function addFittingSection(event) {
        if (event) event.preventDefault();
        if (fittingTemplateHTML.includes('Error: Fitting template not found.')) {
            alert('Cannot add fitting: Template data is missing.'); return;
        }
        const newIndex = fittingCount;
        const $newFitting = $(fittingTemplateHTML);
        const newFittingElement = $newFitting[0];
        initializeFittingAttributes(newFittingElement, newIndex);
        const $lastFitting = fittingsContainer.children(".form-section.fitting-fields").last();
        if ($lastFitting.length) $newFitting.insertAfter($lastFitting);
        else fittingsContainer.append($newFitting);
        fittingCount++;
        setTimeout(() => { attachUploadcareListeners(newFittingElement, newIndex); }, 100); 
        $("html, body").animate({ scrollTop: $newFitting.offset().top - 100 }, 500);
    }

    // --- Function: updateAllFittingSections (For initial page load ONLY) ---
    function updateAllFittingSections() {
        let currentDomIndex = 0;
        fittingsContainer.children(".form-section.fitting-fields").each(function () {
            const currentFittingElement = this;
            const indexForListener = parseInt($(currentFittingElement).attr('data-fitting-index'), 10); 
            initializeFittingAttributes(currentFittingElement, indexForListener);
            setTimeout(() => { attachUploadcareListeners(currentFittingElement, indexForListener); }, 100);
            currentDomIndex++; 
        });
        fittingCount = currentDomIndex;
        cacheFirstFittingValues(); // Cache after initial attributes are set
    }

    // --- Event Handlers ---
    $(document).on("click", ".add-another-fitting-button", addFittingSection);

    $(document).on('jpmFormResettedForRepeater', function() {
        const $firstFittingItem = fittingsContainer.children('.form-section.fitting-fields').first();
        if ($firstFittingItem.length) {
            const firstFittingElement = $firstFittingItem[0];
            // Form.reset() would have cleared editable fields, re-initialize attributes and listeners
            initializeFittingAttributes(firstFittingElement, 0); 
            const ctxProviderInFirst = firstFittingElement.querySelector(`uc-upload-ctx-provider[ctx-name="jpm-photo-uploader-0"]`);
            if (ctxProviderInFirst) $(ctxProviderInFirst).removeData('jpm-ctx-multi-listener-attached');
            setTimeout(() => { attachUploadcareListeners(firstFittingElement, 0); }, 100);
            $firstFittingItem.find('.original-filenames-json').val('');
            fittingCount = 1;
            setTimeout(cacheFirstFittingValues, 10); // Re-cache after form.reset might have affected first item
        } else {
            fittingCount = 0;
        }
    });

    initialOperatorNameField.add(initialAddressOfUnitField).on('input', function () {
         fittingsContainer.children(".form-section.fitting-fields").each(function (idx) {
            if (idx > 0) { // For dynamic fittings
                updateFittingWithOperatorAndAddress($(this));
            }
        });
    });
    firstFittingSizeInput.add(firstFittingUnitSelect).on('change input', function() {
        cacheFirstFittingValues();
        fittingsContainer.children(".form-section.fitting-fields").each(function(idx) {
            if (idx > 0) {
                updateFittingGlobalReadonlyFields($(this));
            }
        });
    });

    // --- Initial Setup on Page Load ---
    const $initialFittingGroup = $(".fitting-field-group").first();
    if ($initialFittingGroup.length) {
        $initialFittingGroup.removeClass("fitting-field-group").addClass("form-section fitting-fields");
        fittingsContainer.append($initialFittingGroup);
    }
    updateAllFittingSections(); // This also calls cacheFirstFittingValues
});