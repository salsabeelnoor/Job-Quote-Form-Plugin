// assets/js/form-submission.js
jQuery(document).ready(function ($) {
    const $form = $('#jpm-complex-form');
    const $messagesDiv = $('#form-messages');
    const $fittingsContainer = $('#fittings-container');
    // const $initialFittingGroupWrapper = $('.fitting-field-group').first(); // Not directly used in submit logic

    $form.on('submit', function (event) {
        event.preventDefault();
        $messagesDiv.html('').removeClass('success error');
        // console.log('JPM Form Submission: Submit event triggered.');

        const formElement = this;
        const formData = new FormData(formElement);

        // console.log("JPM Form Submission: Manually processing and renaming Uploadcare photo fields for PHP...");

        $fittingsContainer.children('.form-section.fitting-fields').each(function() {
            const $fittingSection = $(this);
            const fittingDataIndex = $fittingSection.data('fitting-index');

            if (typeof fittingDataIndex === 'undefined') {
                console.warn("JPM Form Submission: Skipping a fitting section because data-fitting-index is undefined.", $fittingSection[0]);
                return; // continue to next iteration
            }

            // This 'baseUcInternalInputName' should match the 'name' attribute script.js
            // sets on the *inner* input of <uc-form-input>
            const baseUcInternalInputName = `jpm-photo-uploader-${fittingDataIndex}`;
            const desiredPhpName = `fields[fittings][${fittingDataIndex}][photo]`;
            let photoUrl = '';

            // 1. Check if initial FormData already has the value under the UC internal name
            //    (which should be the name of the INNER input field, matching ctx-name)
            if (formData.has(baseUcInternalInputName)) {
                photoUrl = formData.get(baseUcInternalInputName);
                // console.log(`JPM Form Submission: Found URL in initial FormData for key "${baseUcInternalInputName}" (fitting ${fittingDataIndex}): "${photoUrl}"`);
                formData.delete(baseUcInternalInputName); // Remove old key
            } else if (formData.has(baseUcInternalInputName + '[]')) { // In case it's treated as an array
                photoUrl = formData.get(baseUcInternalInputName + '[]');
                // console.log(`JPM Form Submission: Found URL in initial FormData for key "${baseUcInternalInputName}[]" (fitting ${fittingDataIndex}): "${photoUrl}"`);
                formData.delete(baseUcInternalInputName + '[]'); // Remove old key with []
            } else {
                // 2. Fallback (if script.js couldn't set inner input name correctly or FormData missed it)
                //    Try to get it directly from <uc-form-input>'s name (which is the PHP name)
                //    This relies on Uploadcare populating its host custom element's value.
                // console.log(`JPM Form Submission: URL not found in initial FormData for fitting ${fittingDataIndex} via ctx-name derived keys. Attempting host <uc-form-input> with name="${desiredPhpName}".`);
                if (formData.has(desiredPhpName)) {
                    photoUrl = formData.get(desiredPhpName);
                    // console.log(`JPM Form Submission: Fallback - Got URL from <uc-form-input name="${desiredPhpName}"> (fitting ${fittingDataIndex}): "${photoUrl}"`);
                    // No need to delete, as it's already the correct name, just ensuring photoUrl is set.
                } else {
                    console.warn(`JPM Form Submission: Fallback - Could not find photo URL for fitting index ${fittingDataIndex} by any method.`);
                }
            }

            // Set the value in FormData with the name PHP expects.
            // This will add the key if it's missing from the initial check, or overwrite if it was already correct.
            formData.set(desiredPhpName, photoUrl || '');

        });
        // --- End Uploadcare processing ---

        // console.log("JPM Form Submission: Final FormData entries BEFORE AJAX call:");
        // for (let pair of formData.entries()) {
        //     console.log(`  Final FD: ${pair[0]} = ${pair[1]}`);
        // }

        formData.append('action', 'my_jq_form_submission');

        const $submitButton = $(this).find('button.jq-button[name="my_complex_form_submit"]');
        const textWhileSubmitting = 'Submitting...';
        const desiredTextAfterSubmission = 'Send Quote'; // Define the canonical text

        // Disable button and set "Submitting..." text
        $submitButton.prop('disabled', true).html(textWhileSubmitting);

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

                    // --- START: Uploadcare Widget Reset Logic ---
                    const $firstFittingItemForReset = $fittingsContainer.children('.form-section.fitting-fields').first();
                    if ($firstFittingItemForReset.length) {

                        const uploaderElement = $firstFittingItemForReset.find('uc-file-uploader-regular')[0];
                        if (uploaderElement) {
                            if (typeof uploaderElement.clearValue === 'function') {
                                try {
                                    uploaderElement.clearValue();

                                } catch (e) {
                                    console.error('Error calling clearValue() on Uploadcare widget:', e);
                                }
                            } else {
                                
                                const formInputElement = $firstFittingItemForReset.find('uc-form-input')[0];
                                if (formInputElement && typeof formInputElement.value !== 'undefined') {
                                    formInputElement.value = null; 
                                } else {
                                    console.warn('Uploadcare widget in the first fitting does not have a clearValue method or an accessible uc-form-input value property.');
                                }
                            }
                        }
                    }
                    // --- END: Uploadcare Widget Reset Logic ---

                    formElement.reset(); // Now reset standard form inputs

                    const $firstFittingItemAfterReset = $fittingsContainer.children('.form-section.fitting-fields').first();
                    $fittingsContainer.children('.form-section.fitting-fields').not($firstFittingItemAfterReset).remove();

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
                 } else if (jqXHR.responseText) { /* console.error("JPM AJAX Error: ", jqXHR.responseText); */ }
                 $messagesDiv.html('<p class="error-message">' + errorMessage + '</p>').addClass('error');
            },
            complete: function () {
                // Re-enable button and ALWAYS set text back to "Send Quote"
                $submitButton.prop('disabled', false).html(desiredTextAfterSubmission);
            }
        });
    });
});