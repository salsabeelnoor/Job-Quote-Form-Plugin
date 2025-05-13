// assets/js/form-submission.js
jQuery(document).ready(function ($) {
    const $form = $('#jpm-complex-form');
    const $messagesDiv = $('#form-messages');
    const $fittingsContainer = $('#fittings-container');
    const $initialFittingGroupWrapper = $('.fitting-field-group').first(); // The one initially in HTML

    $form.on('submit', function (event) {
        event.preventDefault();
        $messagesDiv.html('').removeClass('success error');
        console.log('JPM Form Submission: Submit event triggered.');

        const formElement = this;
        // Create initial FormData. This will pick up standard inputs AND
        // Uploadcare's inner inputs (likely named after their ctx-name or ctx-name[]).
        const formData = new FormData(formElement);

        console.log("JPM Form Submission: Initial FormData entries (before manual processing):");
        for (let pair of formData.entries()) {
            console.log(`  Initial FD: ${pair[0]} = ${pair[1]}`);
        }

        console.log("JPM Form Submission: Manually processing and renaming Uploadcare photo fields for PHP...");

        // Process all fitting sections, including the first one (if it was moved into fittingsContainer)
        // and any dynamically added ones.
        $fittingsContainer.children('.form-section.fitting-fields').each(function() {
            const $fittingSection = $(this);
            const fittingDataIndex = $fittingSection.data('fitting-index'); // This should be 0, 1, 2...

            if (typeof fittingDataIndex === 'undefined') {
                console.warn("JPM Form Submission: Skipping a fitting section because data-fitting-index is undefined.", $fittingSection[0]);
                return; // continue to next iteration
            }

            // Construct the base name Uploadcare's inner input *might* be using (based on its ctx-name)
            const baseUcInternalInputName = `jpm-photo-uploader-${fittingDataIndex}`;
            const desiredPhpName = `fields[fittings][${fittingDataIndex}][photo]`;
            let photoUrl = '';

            // 1. Check if initial FormData already has the value under the UC internal name (plain or array)
            if (formData.has(baseUcInternalInputName)) {
                photoUrl = formData.get(baseUcInternalInputName);
                console.log(`JPM Form Submission: Found URL in initial FormData for key "${baseUcInternalInputName}" (fitting ${fittingDataIndex}): "${photoUrl}"`);
                formData.delete(baseUcInternalInputName); // Remove old key
            } else if (formData.has(baseUcInternalInputName + '[]')) {
                photoUrl = formData.get(baseUcInternalInputName + '[]');
                console.log(`JPM Form Submission: Found URL in initial FormData for key "${baseUcInternalInputName}[]" (fitting ${fittingDataIndex}): "${photoUrl}"`);
                formData.delete(baseUcInternalInputName + '[]'); // Remove old key with []
            } else {
                // 2. Fallback: Try to get it directly from the <uc-form-input>'s inner input,
                //    just in case initial FormData missed it or UC updated it after FormData creation.
                console.log(`JPM Form Submission: URL not found in initial FormData for fitting ${fittingDataIndex} via ctx-name derived keys. Attempting DOM query.`);
                const $ucFormInputWrapper = $fittingSection.find(`uc-form-input.fitting-uploadcare-input[ctx-name="${baseUcInternalInputName}"]`);
                if ($ucFormInputWrapper.length) {
                    // Prefer inner input named as the ctx-name (Uploadcare default or fallback)
                    let $innerStandardInput = $ucFormInputWrapper.find(`input[name="${baseUcInternalInputName}"], input[name="${baseUcInternalInputName}[]"]`);
                     if (!$innerStandardInput.length) {
                        // If not found by ctx-name, try by desiredPhpName (if UC mirrors it to inner input)
                        $innerStandardInput = $ucFormInputWrapper.find(`input[name="${desiredPhpName}"]`);
                    }
                    if (!$innerStandardInput.length) { // Final fallback generic search within the component
                        $innerStandardInput = $ucFormInputWrapper.find('input[type="text"], input[type="hidden"]');
                    }

                    if ($innerStandardInput.length) {
                        photoUrl = $innerStandardInput.first().val();
                        console.log(`JPM Form Submission: Fallback DOM Query - Got URL from inner input for ctx "${baseUcInternalInputName}" (fitting ${fittingDataIndex}): "${photoUrl}"`);
                    } else {
                        console.warn(`JPM Form Submission: Fallback DOM Query - Could not find ANY INNER input for ctx "${baseUcInternalInputName}" in fitting index ${fittingDataIndex}.`);
                    }
                } else {
                     console.warn(`JPM Form Submission: Fallback DOM Query - Could not find <uc-form-input ctx-name="${baseUcInternalInputName}"> in fitting index ${fittingDataIndex}.`);
                }
            }

            // Set the value in FormData with the name PHP expects.
            // This will add the key if it's missing, or overwrite if it was somehow partially picked up.
            formData.set(desiredPhpName, photoUrl || '');

            if (photoUrl) {
                 console.log(`JPM Form Submission: Ensured FormData has: Name="${desiredPhpName}", Value="${photoUrl}"`);
            } else {
                 console.log(`JPM Form Submission: Ensured FormData has EMPTY for: Name="${desiredPhpName}" (fitting index ${fittingDataIndex})`);
            }
        });
        // --- End Uploadcare processing ---

        console.log("JPM Form Submission: Final FormData entries BEFORE AJAX call:");
        for (let pair of formData.entries()) {
            console.log(`  Final FD: ${pair[0]} = ${pair[1]}`);
        }

        formData.append('action', 'my_jq_form_submission');

        const $submitButton = $(this).find('button[type="submit"]');
        const originalButtonText = $submitButton.first().html() || 'Send Quote'; // Fallback text
        $submitButton.prop('disabled', true).html('Submitting...');

        $.ajax({
            url: jpmJQForm.ajaxurl,
            type: 'POST',
            data: formData,
            processData: false,
            contentType: false,
            dataType: 'json',
            success: function (response) {
                if (response.success) {
                    $messagesDiv.html('<p class="success-message">' + response.data.message + '</p>').addClass('success');
                    formElement.reset(); // Resets standard form inputs

                    // Visually reset Uploadcare widgets - best effort
                    // This part relies on uc-config clearable="true" for user interaction,
                    // or Uploadcare's own handling of form reset.
                    // Forcing a visual clear of the widget programmatically is complex without a direct UC API.
                    $fittingsContainer.find('uc-file-uploader-regular').each(function() {
                        // If Uploadcare widget has a public 'clearValue' or 'reset' method, it could be called here.
                        // Example: if (typeof this.clearFiles === 'function') { this.clearFiles(); }
                        // This is component-specific and would require knowing Uploadcare's web component API.
                    });


                    const $firstFittingItem = $fittingsContainer.children('.form-section.fitting-fields').first();
                    $fittingsContainer.children('.form-section.fitting-fields').not($firstFittingItem).remove();

                    // Trigger event for script.js to update its internal state (like fittingCount)
                    // and re-initialize the first item if necessary.
                    $(document).trigger('jpmFormResettedForRepeater');

                    $('html, body').animate({ scrollTop: $form.offset().top - 50 }, 300);
                } else {
                    let errorMessage = response.data.message || 'An error occurred.';
                    $messagesDiv.html('<p class="error-message">' + errorMessage + '</p>').addClass('error');
                }
            },
            error: function (jqXHR, textStatus, errorThrown) {
                 let errorMessage = 'A server error occurred: ' + textStatus;
                 if (jqXHR.responseJSON && jqXHR.responseJSON.data && jqXHR.responseJSON.data.message) {
                     errorMessage = jqXHR.responseJSON.data.message;
                 } else if (jqXHR.responseText) { console.error("JPM AJAX Error: ", jqXHR.responseText); }
                 $messagesDiv.html('<p class="error-message">' + errorMessage + '</p>').addClass('error');
            },
            complete: function () {
                $submitButton.prop('disabled', false).html(originalButtonText);
            }
        });
    });
});