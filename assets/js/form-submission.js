// assets/js/form-submission.js
jQuery(document).ready(function ($) {
    const $form = $('#jpm-complex-form');
    const $messagesDiv = $('#form-messages');
    const $fittingsContainer = $('#fittings-container');

    $form.on('submit', function (event) {
        event.preventDefault();
        $messagesDiv.html('').removeClass('success error');
        // console.log('JPM Form Submission: Submit event triggered.');

        const formElement = this;
        const formData = new FormData(formElement);

        // console.log("JPM Form Submission: Processing FormData for Uploadcare URLs...");

        $fittingsContainer.children('.form-section.fitting-fields').each(function() {
            const $fittingSection = $(this);
            const fittingDataIndex = $fittingSection.data('fitting-index');

            if (typeof fittingDataIndex === 'undefined') {
                console.warn("JPM Form Submission: Skipping a fitting section, data-fitting-index undefined.", $fittingSection[0]);
                return; 
            }

            // Name of the inner input of uc-form-input (should match its ctx-name)
            const ucInnerInputName = `jpm-photo-uploader-${fittingDataIndex}`;
            // Name of the uc-form-input host element itself (holds the URL for PHP)
            const ucHostInputName = `fields[fittings][${fittingDataIndex}][photo]`;
            let photoUrl = '';

            // Attempt 1: Get URL from the inner input's name (which matches ctx-name)
            if (formData.has(ucInnerInputName)) {
                photoUrl = formData.get(ucInnerInputName);
                formData.delete(ucInnerInputName); // Remove this, as we'll re-add with phpExpectedName
            } else if (formData.has(ucInnerInputName + '[]')) { 
                photoUrl = formData.get(ucInnerInputName + '[]');
                formData.delete(ucInnerInputName + '[]');
            }
            // Attempt 2: If not found above, assume URL is already in FormData under the host input's name
            else if (formData.has(ucHostInputName)) {
                photoUrl = formData.get(ucHostInputName);
                // No need to delete, it's already named correctly for PHP, just ensure photoUrl var is set
            } else {
                console.warn(`JPM Form Submission: Could not find photo URL for fitting index ${fittingDataIndex}.`);
            }

            // Ensure the URL is set in FormData under the name PHP expects (ucHostInputName)
            formData.set(ucHostInputName, photoUrl || '');
        });
        // --- End Uploadcare processing ---

        formData.append('action', 'my_jq_form_submission');

        const $submitButton = $(this).find('button.jq-button[name="my_complex_form_submit"]');
        const textWhileSubmitting = 'Submitting...';
        const desiredTextAfterSubmission = 'Send Quote';

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

                    // --- START: Uploadcare Widget Reset Logic (Revised) ---
                    const $firstFittingItemForReset = $fittingsContainer.children('.form-section.fitting-fields').first();
                    if ($firstFittingItemForReset.length) {
                        const firstFittingIndex = $firstFittingItemForReset.data('fitting-index'); 
                        const uploaderCtxName = `jpm-photo-uploader-${firstFittingIndex}`;
                        
                        // Attempt to find the uc-upload-ctx-provider for this uploader
                        const ctxProviderElement = document.querySelector(`uc-upload-ctx-provider[ctx-name="${uploaderCtxName}"]`);

                        if (ctxProviderElement) {
                            // console.log(`JPM Form Submission: Found ctxProvider for ${uploaderCtxName}`, ctxProviderElement);
                            let clearedViaProvider = false;
                            // Try common API patterns on the provider
                            if (typeof ctxProviderElement.clearCollection === 'function') {
                                try {
                                    ctxProviderElement.clearCollection();
                                    clearedViaProvider = true;
                                    // console.log(`JPM Form Submission: Called clearCollection() on ctxProvider for ${uploaderCtxName}`);
                                } catch (e) { console.error(`Error calling clearCollection() on ctxProvider for ${uploaderCtxName}:`, e); }
                            } else if (typeof ctxProviderElement.uploadCollection === 'object' && ctxProviderElement.uploadCollection && typeof ctxProviderElement.uploadCollection.clearAll === 'function') {
                                try { // Example if provider has a property that is a collection API
                                    ctxProviderElement.uploadCollection.clearAll();
                                    clearedViaProvider = true;
                                    // console.log(`JPM Form Submission: Called uploadCollection.clearAll() via ctxProvider for ${uploaderCtxName}`);
                                } catch (e) { console.error(`Error calling uploadCollection.clearAll() for ${uploaderCtxName}:`, e); }
                            }
                            // Add other attempts to use provider API if known

                            if (!clearedViaProvider) {
                                // Fallback: Try methods on the uc-file-uploader-regular element itself
                                const uploaderElement = $firstFittingItemForReset.find('uc-file-uploader-regular')[0];
                                if (uploaderElement && typeof uploaderElement.clearValue === 'function') {
                                    try {
                                        uploaderElement.clearValue();
                                        // console.log(`JPM Form Submission: Called clearValue() directly on uploaderElement for ${uploaderCtxName}`);
                                    } catch (e) { console.error(`Error calling clearValue() on uploaderElement for ${uploaderCtxName}:`, e); }
                                } else {
                                     console.warn(`JPM Form Submission: No known programmatic reset method found for Uploadcare widget with ctx-name "${uploaderCtxName}". Form reset will clear input value.`);
                                }
                            }
                        } else {
                            console.warn(`JPM Form Submission: Could not find uc-upload-ctx-provider with ctx-name "${uploaderCtxName}" to attempt widget reset.`);
                            // If provider not found, try direct uploader clear as a last resort
                            const uploaderElement = $firstFittingItemForReset.find('uc-file-uploader-regular')[0];
                            if (uploaderElement && typeof uploaderElement.clearValue === 'function') {
                                try { uploaderElement.clearValue(); } catch (e) { /* ignore */ }
                            }
                        }
                    }
                    // --- END: Uploadcare Widget Reset Logic ---

                    formElement.reset(); // Reset standard form inputs. This should clear the <uc-form-input value="">

                    // Explicitly clear the hidden original filename input for the first item
                    if ($firstFittingItemForReset.length) {
                        $firstFittingItemForReset.find('.original-filename-input').val('');
                    }

                    // Remove dynamic fittings except the first one
                    const $firstFittingItemAfterReset = $fittingsContainer.children('.form-section.fitting-fields').first();
                    $fittingsContainer.children('.form-section.fitting-fields').not($firstFittingItemAfterReset).remove();

                    // Trigger event for script.js to update its internal state (like fittingCount)
                    // and re-initialize listeners on the first item.
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
                $submitButton.prop('disabled', false).html(desiredTextAfterSubmission);
            }
        });
    });
});