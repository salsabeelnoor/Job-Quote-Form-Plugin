jQuery(document).ready(function ($) {
    const $form = $('#jpm-complex-form');
    const $messagesDiv = $('#form-messages');
    const $fittingsContainer = $('#fittings-container');

    $form.on('submit', function (event) {
        event.preventDefault();
        $messagesDiv.html('').removeClass('success error');

        const formElement = this;
        const formData = new FormData(formElement);

        $fittingsContainer.children('.form-section.fitting-fields').each(function() {
            const $fittingSection = $(this);
            const fittingDataIndex = $fittingSection.data('fitting-index');

            if (typeof fittingDataIndex === 'undefined') {
                console.warn("JPM Form Submission: Skipping a fitting section, data-fitting-index undefined.", $fittingSection[0]);
                return; 
            }

            const ucInnerInputName = `jpm-photo-uploader-${fittingDataIndex}`;
            const ucHostInputName = `fields[fittings][${fittingDataIndex}][photo]`;
            let photoUrl = '';

            // Get URL from the inner input's name (which matches ctx-name)
            if (formData.has(ucInnerInputName)) {
                photoUrl = formData.get(ucInnerInputName);
                formData.delete(ucInnerInputName); 
            } else if (formData.has(ucInnerInputName + '[]')) { 
                photoUrl = formData.get(ucInnerInputName + '[]');
                formData.delete(ucInnerInputName + '[]');
            }
            // If not found above, assume URL is already in FormData under the host input's name
            else if (formData.has(ucHostInputName)) {
                photoUrl = formData.get(ucHostInputName);
            } else {
                console.warn(`JPM Form Submission: Could not find photo URL for fitting index ${fittingDataIndex}.`);
            }

            formData.set(ucHostInputName, photoUrl || '');
        });

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

                    // --- START: Uploadcare Widget Reset Logic ---
                    const $firstFittingItemForReset = $fittingsContainer.children('.form-section.fitting-fields').first();
                    if ($firstFittingItemForReset.length) {
                        const firstFittingIndex = $firstFittingItemForReset.data('fitting-index'); 
                        const uploaderCtxName = `jpm-photo-uploader-${firstFittingIndex}`;
                        
                        const ctxProviderElement = document.querySelector(`uc-upload-ctx-provider[ctx-name="${uploaderCtxName}"]`);

                        if (ctxProviderElement) {
                            
                            let clearedViaProvider = false;

                            if (typeof ctxProviderElement.clearCollection === 'function') {
                                try {
                                    ctxProviderElement.clearCollection();
                                    clearedViaProvider = true;

                                } catch (e) { console.error(`Error calling clearCollection() on ctxProvider for ${uploaderCtxName}:`, e); }
                            } else if (typeof ctxProviderElement.uploadCollection === 'object' && ctxProviderElement.uploadCollection && typeof ctxProviderElement.uploadCollection.clearAll === 'function') {
                                try { 
                                    ctxProviderElement.uploadCollection.clearAll();
                                    clearedViaProvider = true;

                                } catch (e) { console.error(`Error calling uploadCollection.clearAll() for ${uploaderCtxName}:`, e); }
                            }


                            if (!clearedViaProvider) {

                                const uploaderElement = $firstFittingItemForReset.find('uc-file-uploader-regular')[0];
                                if (uploaderElement && typeof uploaderElement.clearValue === 'function') {
                                    try {
                                        uploaderElement.clearValue();

                                    } catch (e) { console.error(`Error calling clearValue() on uploaderElement for ${uploaderCtxName}:`, e); }
                                } else {
                                     console.warn(`JPM Form Submission: No known programmatic reset method found for Uploadcare widget with ctx-name "${uploaderCtxName}". Form reset will clear input value.`);
                                }
                            }
                        } else {
                            console.warn(`JPM Form Submission: Could not find uc-upload-ctx-provider with ctx-name "${uploaderCtxName}" to attempt widget reset.`);

                            const uploaderElement = $firstFittingItemForReset.find('uc-file-uploader-regular')[0];
                            if (uploaderElement && typeof uploaderElement.clearValue === 'function') {
                                try { uploaderElement.clearValue(); } 
                                catch (e) {  }
                            }
                        }
                    }
                    // --- END: Uploadcare Widget Reset Logic ---

                    formElement.reset(); 
                    if ($firstFittingItemForReset.length) {
                        $firstFittingItemForReset.find('.original-filename-input').val('');
                    }
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
                 } else if (jqXHR.responseText) { 
                    console.error("JPM AJAX Error: ", jqXHR.responseText); 
                }
                 $messagesDiv.html('<p class="error-message">' + errorMessage + '</p>').addClass('error');
            },
            complete: function () {
                $submitButton.prop('disabled', false).html(desiredTextAfterSubmission);
            }
        });
    });
});