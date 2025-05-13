jQuery(document).ready(function ($) {
    // console.log('JPM Script: Document ready.');

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

    // --- Function: initializeFittingSection ---
    // Sets all attributes and styles for a given fitting section and its Uploadcare components.
    // Called BEFORE the element is appended to the live DOM when adding new fittings.
    function initializeFittingSection(fittingElement, index) {
        const $fitting = $(fittingElement);

        // 1. Update visual fitting number and data attribute
        let $numberSpan = $fitting.find(".fitting-number");
        if (!$numberSpan.length) {
            $numberSpan = $fitting.find(".fitting-number-initial");
        }
        $numberSpan.text(index + 1);
        $fitting.attr("data-fitting-index", index);

        // 2. Populate read-only operator/address fields (if templated)
        if ($fitting.find(".readonly-operator-name").length) {
            updateFittingWithOperatorAndAddress($fitting);
        }

        // 3. Update 'name' attributes for general form inputs
        $fitting.find('[name*="fields[fittings]"]').not('uc-form-input').each(function () {
            const $input = $(this);
            if ($input.closest('uc-form-input').length) return; // Skip inner UC input

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
            } else if (currentId && currentId.match(/_\d+$/) && index > 0) { // Only for templated, not first item
                const newId = currentId.replace(/_\d+$/, "_" + index);
                $('label[for="' + currentId + '"]').attr('for', newId);
                $el.attr('id', newId);
            }
        });

        // 5. Initialize Uploadcare Components
        $fitting.find('uc-config, uc-file-uploader-regular, uc-form-input').each(function() {
            const $ucElement = $(this);
            const rawDomElement = this;
            let currentCtxNameAttr = $ucElement.attr('ctx-name');
            let newCtxName;

            if (currentCtxNameAttr && currentCtxNameAttr.includes('__INDEX__')) {
                newCtxName = currentCtxNameAttr.replace(/__INDEX__/g, index.toString());
                $ucElement.attr('ctx-name', newCtxName);
            } else if (currentCtxNameAttr) {
                const expectedCtxName = `jpm-photo-uploader-${index}`;
                if (currentCtxNameAttr !== expectedCtxName) {
                    newCtxName = expectedCtxName;
                    $ucElement.attr('ctx-name', newCtxName);
                } else {
                    newCtxName = currentCtxNameAttr;
                }
            } else {
                newCtxName = `jpm-photo-uploader-${index}`;
                $ucElement.attr('ctx-name', newCtxName);
                console.warn(`JPM Script: No initial ctx-name on host. Set ctx-name to: "${newCtxName}" for [${rawDomElement.tagName}] index ${index}`);
            }

            if (newCtxName && rawDomElement.style && typeof rawDomElement.style.setProperty === 'function') {
                rawDomElement.style.setProperty('--ctx-name', `'${newCtxName}'`);
            }

            if ($ucElement.is('uc-form-input')) {
                const phpExpectedName = `fields[fittings][${index}][photo]`;
                $ucElement.attr('name', phpExpectedName); // Host <uc-form-input> gets PHP name

                let $innerInput = $ucElement.find('input[type="text"], input[type="hidden"]');
                if ($innerInput.length) {
                    $innerInput.first().attr('name', newCtxName); // Inner <input> name matches ctx-name
                } else {
                    console.warn(`JPM Script: Could not find an INNER input for <uc-form-input ctx-name="${newCtxName}">.`);
                }
            }
        });
         // Optional: If you need to attach event listeners to dynamic uploaders
        // $fitting.find('uc-file-uploader-regular').on('change', function(event) {
        //     const cdnUrl = event.detail?.allEntries?.[0]?.cdnUrl;
        //     console.log(`File uploaded for dynamic uploader (index ${index}): ${cdnUrl}`);
        // });


    } // End of initializeFittingSection

    // --- Function: updateFittingWithOperatorAndAddress ---
    function updateFittingWithOperatorAndAddress($fitting) {
        const operatorNameValue = initialOperatorNameField.val();
        const addressValue = initialAddressOfUnitField.val();
        $fitting.find(".readonly-operator-name").val(operatorNameValue);
        $fitting.find(".readonly-address-of-unit").val(addressValue);
    }

    // --- Function: addFittingSection (Initialize Before Append) ---
    function addFittingSection(event) {
        if (event) event.preventDefault();
        if (fittingTemplateHTML.includes('Error: Fitting template not found.')) {
            alert('Cannot add fitting: Template data is missing.');
            return;
        }

        const newIndex = fittingCount; // Current count is the index for the new one (0-based)
        const $newFitting = $(fittingTemplateHTML);
        const newFittingElement = $newFitting[0];

        // Initialize the new fitting section BEFORE appending it to the DOM
        initializeFittingSection(newFittingElement, newIndex);

        // Now append the fully initialized new fitting section
        const $lastFitting = fittingsContainer.children(".form-section.fitting-fields").last();
        if ($lastFitting.length) {
            $newFitting.insertAfter($lastFitting);
        } else {
            fittingsContainer.append($newFitting);
        }

        fittingCount++; // Increment the count of fittings

        $("html, body").animate({ scrollTop: $newFitting.offset().top - 100 }, 500);
    } // End of addFittingSection

    // --- Function: updateAllFittingSections (For initial page load ONLY) ---
    function updateAllFittingSections() {
        let currentDomIndex = 0;
        fittingsContainer.children(".form-section.fitting-fields").each(function () {
            initializeFittingSection(this, currentDomIndex);
            currentDomIndex++;
        });
        fittingCount = currentDomIndex; // Set the initial count based on existing items
        // console.log('JPM Script: Initial page setup - fittingCount set to:', fittingCount);
    }

    // --- Event Handlers ---
    $(document).on("click", ".add-another-fitting-button", addFittingSection);

    $(document).on('jpmFormResettedForRepeater', function() {
        const $firstFittingItem = fittingsContainer.children('.form-section.fitting-fields').first();
        if ($firstFittingItem.length) {
            initializeFittingSection($firstFittingItem[0], 0); // Re-initialize first item
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
    // console.log('JPM Script: Starting Initial Setup...');
    const $initialFittingGroup = $(".fitting-field-group").first();
    if ($initialFittingGroup.length) {
        $initialFittingGroup.removeClass("fitting-field-group").addClass("form-section fitting-fields");
        fittingsContainer.append($initialFittingGroup);
    }

    updateAllFittingSections(); // Called ONCE on page load

    // Attach event listeners to existing uploaders (if any)
    // This will only catch the first one. For dynamic ones, attach in initializeFittingSection or use delegation.
    $('uc-file-uploader-regular').each(function (idx) { // Changed index to idx to avoid conflict
        $(this).on('change', function (event) {
            const cdnUrl = event.detail?.allEntries?.[0]?.cdnUrl;
            // console.log(`Initial uploader ${idx} changed: ${cdnUrl}`);
        });
    });

    // console.log('JPM Script: Initial Setup Finished.');
});