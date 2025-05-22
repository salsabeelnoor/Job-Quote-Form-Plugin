// assets/js/form-submission.js
jQuery(document).ready(function ($) {
    const $form = $('#jpm-complex-form');
    const $messagesDiv = $('#form-messages');
    const $fittingsContainer = $('#fittings-container');

    $form.on('submit', function (event) {
        event.preventDefault();
        $messagesDiv.html('').removeClass('success error disappearing'); // Also clear disappearing

        const formElement = this;
        const formData = new FormData(formElement); // Initial FormData from the form

        // console.log('JPM Form Submission: Initial FormData before processing:');
        // for(let pair of formData.entries()) { console.log(pair[0]+ ': '+ pair[1]); }

        // --- Process FormData to structure photo URLs correctly for PHP ---
        // We need to find all entries like "jpm-photo-uploader-0[]", "jpm-photo-uploader-1[]", etc.
        // and map them to "fields[fittings][0][photo][]", "fields[fittings][1][photo][]"
        
        let processedFittingData = {}; // temp object to group data by index

        // Iterate over a copy of keys because we might delete entries
        const formDataKeys = Array.from(formData.keys());

        formDataKeys.forEach(key => {
            // Check for Uploadcare's internal URL inputs (e.g., jpm-photo-uploader-0[])
            const ucMatch = key.match(/^(jpm-photo-uploader-(\d+))(\[\])?$/);
            if (ucMatch) {
                const fittingDataIndex = parseInt(ucMatch[2], 10);
                const baseCtxName = ucMatch[1]; // e.g., jpm-photo-uploader-0

                if (!processedFittingData[fittingDataIndex]) {
                    processedFittingData[fittingDataIndex] = { urls: [] };
                }
                
                // Get all values for this key (FormData returns them if name ends with [])
                const urlsForThisUploader = formData.getAll(key);
                urlsForThisUploader.forEach(url => {
                    if (url) { // Ensure URL is not empty
                        processedFittingData[fittingDataIndex].urls.push(url);
                    }
                });
                formData.delete(key); // Delete the original CTX_NAME[] entry(ies)
            }
        });

        // Now, add the processed photo URLs back to formData in the PHP-expected format
        for (const index in processedFittingData) {
            if (processedFittingData.hasOwnProperty(index) && processedFittingData[index].urls.length > 0) {
                const phpPhotoArrayName = `fields[fittings][${index}][photo][]`;
                processedFittingData[index].urls.forEach(url => {
                    formData.append(phpPhotoArrayName, url);
                });
            } else if (processedFittingData.hasOwnProperty(index)) {
                // If no URLs but the fitting exists, ensure PHP receives an empty array for 'photo' for that fitting
                // This might not be strictly necessary if your PHP handles missing 'photo' keys,
                // but can be useful for consistency.
                // However, if no photos are selected, Uploadcare might not submit any CTX_NAME[] fields at all.
                // PHP's `isset($fitting_row['photo'])` will handle cases where no photo data is sent.
            }
        }
        // The fields[fittings][INDEX][photo_original_filenames_json] will be picked up directly by new FormData()
        // as it's a standard hidden input with a unique name per fitting.

        // console.log('JPM Form Submission: FormData after processing photo URLs:');
        // for(let pair of formData.entries()) { console.log(pair[0]+ ': '+ pair[1]); }
        // --- End FormData processing ---


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
                    $messagesDiv.html('<p class="success-message">' + response.data.message + '</p>')
                                .removeClass('error').addClass('success disappearing');

                    setTimeout(function() {
                        $messagesDiv.removeClass('disappearing success').html('');
                    }, 6500);

                    // --- START: Uploadcare Widget Reset Logic ---
                    const $firstFittingItemForReset = $fittingsContainer.children('.form-section.fitting-fields').first();
                    if ($firstFittingItemForReset.length) {
                        const firstFittingIndex = $firstFittingItemForReset.data('fitting-index'); 
                        const uploaderCtxName = `jpm-photo-uploader-${firstFittingIndex}`;
                        const ctxProviderElement = document.querySelector(`uc-upload-ctx-provider[ctx-name="${uploaderCtxName}"]`);

                        if (ctxProviderElement) {
                            let clearedViaProvider = false;
                            if (typeof ctxProviderElement.clearCollection === 'function') { // Replace with actual API method
                                try { ctxProviderElement.clearCollection(); clearedViaProvider = true; } 
                                catch (e) { console.error(`Error calling clearCollection on ctxProvider for ${uploaderCtxName}:`, e); }
                            } else if (typeof ctxProviderElement.uploadCollection === 'object' && ctxProviderElement.uploadCollection && typeof ctxProviderElement.uploadCollection.clearAll === 'function') {
                                try { ctxProviderElement.uploadCollection.clearAll(); clearedViaProvider = true; } 
                                catch (e) { console.error(`Error calling uploadCollection.clearAll for ${uploaderCtxName}:`, e); }
                            }

                            if (!clearedViaProvider) {
                                const uploaderElement = $firstFittingItemForReset.find('uc-file-uploader-regular')[0];
                                if (uploaderElement && typeof uploaderElement.clearValue === 'function') {
                                    try { uploaderElement.clearValue(); } 
                                    catch (e) { console.error(`Error calling clearValue on uploaderElement for ${uploaderCtxName}:`, e); }
                                } else {
                                     console.warn(`JPM Form Submission: No known programmatic reset method found for UC widget ctx-name "${uploaderCtxName}".`);
                                }
                            }
                        } else {
                            console.warn(`JPM Form Submission: Could not find uc-upload-ctx-provider with ctx-name "${uploaderCtxName}" for reset.`);
                            const uploaderElement = $firstFittingItemForReset.find('uc-file-uploader-regular')[0];
                            if (uploaderElement && typeof uploaderElement.clearValue === 'function') {
                                try { uploaderElement.clearValue(); } catch (e) { /* ignore */ }
                            }
                        }
                    }
                    // --- END: Uploadcare Widget Reset Logic ---

                    formElement.reset(); 
                    if ($firstFittingItemForReset.length) {
                        $firstFittingItemForReset.find('.original-filenames-json').val('');
                    }
                    
                    const $firstFittingItemAfterReset = $fittingsContainer.children('.form-section.fitting-fields').first();
                    $fittingsContainer.children('.form-section.fitting-fields').not($firstFittingItemAfterReset).remove();

                    $(document).trigger('jpmFormResettedForRepeater');
                    $('html, body').animate({ scrollTop: $form.offset().top - 50 }, 300);
                } else {
                    $messagesDiv.html('<p class="error-message">' + (response.data.message || 'An error occurred.') + '</p>')
                                .removeClass('success disappearing').addClass('error');
                }
            },
            error: function (jqXHR, textStatus, errorThrown) {
                 let errorMessage = 'A server error occurred: ' + textStatus;
                 if (jqXHR.responseJSON && jqXHR.responseJSON.data && jqXHR.responseJSON.data.message) {
                     errorMessage = jqXHR.responseJSON.data.message;
                 } else if (jqXHR.responseText) { console.error("JPM AJAX Error: ", jqXHR.responseText); }
                 $messagesDiv.html('<p class="error-message">' + errorMessage + '</p>')
                             .removeClass('success disappearing').addClass('error');
            },
            complete: function () {
                $submitButton.prop('disabled', false).html(desiredTextAfterSubmission);
            }
        });
    });
});