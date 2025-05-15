<?php
/**
 * Plugin Name: Job Quote Submission Form
 * Description: Frontend form with dynamic repeatable fields for ACF Pro Repeater using Uploadcare for image URLs. Uploadcare assets loaded externally.
 * Version: 1.6.0
 * Author: Salsabeel Noor
 * Requires Plugins: Advanced Custom Fields PRO, JPM Secure Page Gate
 */

 if ( ! defined( 'ABSPATH' ) ) {
    exit; // Exit if accessed directly.
}

if ( ! defined( 'JQ_FORM_PLUGIN_DIR' ) ) {
    define( 'JQ_FORM_PLUGIN_DIR', untrailingslashit( plugin_dir_path( __FILE__ ) ) );
}

/**
 * Retrieves choices for a specific select sub-field within a named repeater field.
 */
function jq_get_acf_select_choices_from_repeater( $repeater_name, $select_sub_field_name ) {
    if ( ! function_exists( 'acf_get_field_groups' ) || ! function_exists( 'acf_get_fields' ) ) {
        return [];
    }
    foreach ( acf_get_field_groups() as $field_group ) {
        $fields_in_group = acf_get_fields( $field_group['key'] );
        if ( empty( $fields_in_group ) ) {
            continue;
        }
        foreach ( $fields_in_group as $field ) {
            if ( isset( $field['name'] ) && $field['name'] === $repeater_name && $field['type'] === 'repeater' && ! empty( $field['sub_fields'] ) ) {
                foreach ( $field['sub_fields'] as $sub_field ) {
                    if ( isset( $sub_field['name'] ) && $sub_field['name'] === $select_sub_field_name && $sub_field['type'] === 'select' && ! empty( $sub_field['choices'] ) ) {
                        return $sub_field['choices'];
                    }
                }
            }
        }
    }
    return [];
}

function jpm_send_wordpress_quote_email($operator_name, $address_of_unit, $fittings_raw_data, $post_id = null) {
    $email_body_parts = [];
    $unit_of_measurement_choices = jq_get_acf_select_choices_from_repeater('fittings', 'unit_of_measurement');
    $fitting_type_choices = jq_get_acf_select_choices_from_repeater('fittings', 'fitting_type');

    $email_body_parts[] = "Operator Name: " . esc_html($operator_name);
    $email_body_parts[] = "Address of Unit: " . esc_html($address_of_unit);

    if (isset($fittings_raw_data) && is_array($fittings_raw_data)) {
        $fitting_email_lines = []; 
        foreach ($fittings_raw_data as $index => $fitting_row) {
            if (!is_array($fitting_row)) continue;
            
            $current_fitting_email_lines = ["Fitting #" . ($index + 1) . ":"]; 

            $current_fitting_email_lines[] = "  Size of Unit: " . esc_html(isset($fitting_row['size_of_unit']) ? (string)floatval($fitting_row['size_of_unit']) : '0');
            
            $unit_value = isset($fitting_row['unit_of_measurement']) ? sanitize_text_field($fitting_row['unit_of_measurement']) : '';
            $unit_label = isset($unit_of_measurement_choices[$unit_value]) ? $unit_of_measurement_choices[$unit_value] : $unit_value;
            $current_fitting_email_lines[] = "  Unit of Measurement: " . esc_html($unit_label);
            
            $type_value = isset($fitting_row['fitting_type']) ? sanitize_text_field($fitting_row['fitting_type']) : '';
            $type_label = isset($fitting_type_choices[$type_value]) ? $fitting_type_choices[$type_value] : $type_value;
            $current_fitting_email_lines[] = "  Fitting Type: " . esc_html($type_label);
            
            $current_fitting_email_lines[] = "  Additional Notes: " . nl2br(esc_html(isset($fitting_row['additional_notes']) ? sanitize_textarea_field($fitting_row['additional_notes']) : ''));
            
            $current_fitting_email_lines[] = "  External File Reference: " . esc_html(isset($fitting_row['external_file_reference']) ? esc_url_raw($fitting_row['external_file_reference']) : '');

            if (!empty($fitting_row['photo'])) {
                $uploadcare_url = esc_url_raw(trim($fitting_row['photo']));
                if (filter_var($uploadcare_url, FILTER_VALIDATE_URL) && strpos($uploadcare_url, 'ucarecdn.com') !== false) {
                    $current_fitting_email_lines[] = "  Photo (Uploadcare URL): <a href='" . esc_url($uploadcare_url) . "' target='_blank'>" . esc_url($uploadcare_url) . "</a>";
                } else {
                    $current_fitting_email_lines[] = "  Photo (Uploadcare): Invalid URL - " . esc_html($fitting_row['photo']);
                }
            } else {
                $current_fitting_email_lines[] = "  Photo: Not provided";
            }
            $fitting_email_lines[] = implode("\n", $current_fitting_email_lines);
        }
        if (!empty($fitting_email_lines)) {
            $email_body_parts[] = "\nFittings Details:\n" . implode("\n\n", $fitting_email_lines);
        }
    }



    $admin_email = get_option('admin_email');
    $email_subject = 'New Submission: ' . ($operator_name ?? 'Unknown');
    $email_headers = ['Content-Type: text/html; charset=UTF-8'];
    $final_email_body = "New job quote:<br><br>" . nl2br(implode("\n", $email_body_parts));
    wp_mail($admin_email, $email_subject, $final_email_body, $email_headers);
}

/**
 * Sends data to the Make.com webhook.
 *
 * @param array $payload The data payload to send to Make.com.
 * @param string $webhook_url The Make.com webhook URL.
 * @param int $post_id The ID of the WordPress post associated with this submission (for logging).
 */
function jpm_send_data_to_make_webhook($payload, $webhook_url, $post_id) {
    if (empty($webhook_url) || strpos($webhook_url, 'YOUR_MAKE_COM_WEBHOOK_URL_HERE') !== false) {
        error_log('JPM Quote - Make.com webhook URL is not configured. Skipping send for post ID ' . $post_id);
        return false; // Indicate that sending was skipped or failed due to config
    }

     $json_payload_for_make = json_encode($payload); // Encode it once

    // Log the exact JSON payload being sent to Make.com
    error_log('JPM Quote (to Make.com) - Payload for post ID ' . $post_id . ': ' . $json_payload_for_make);

    $args = [
        'body'        => $json_payload_for_make,
        'headers'     => ['Content-Type' => 'application/json'],
        'timeout'     => 15, // seconds
        'redirection' => 5,
        'blocking'    => true, // Wait for Make's immediate "Accepted" response
        'sslverify'   => true, // true for production
    ];

    error_log('JPM Quote (to Make.com) - wp_remote_post args for post ID ' . $post_id . ': ' . print_r($args, true)); // Optional: for deep debugging

    $response_from_make = wp_remote_post($webhook_url, $args);

    if (is_wp_error($response_from_make)) {
        error_log('JPM Quote - Error sending data to Make.com for post ID ' . $post_id . ': ' . $response_from_make->get_error_message());
        return false;
    } else {
        $response_code = wp_remote_retrieve_response_code($response_from_make);
        $response_body = wp_remote_retrieve_body($response_from_make);
        if ($response_code !== 200 || strtolower(trim($response_body)) !== 'accepted') {
            error_log('JPM Quote - Make.com webhook returned unexpected response for post ID ' . $post_id . '. Status: ' . $response_code . ' Body: ' . $response_body);
            return false;
        } else {
            error_log('JPM Quote - Data successfully sent to Make.com for post ID ' . $post_id . '. Response: Accepted');
            return true;
        }
    }
}

function jpm_jq_handle_form_submission() {
    // 1. Verify Nonce and Basic Data Presence
    if (!isset($_POST['my_complex_form_nonce_field']) || !wp_verify_nonce(sanitize_text_field(wp_unslash($_POST['my_complex_form_nonce_field'])), 'my_complex_form_nonce_action')) {
        wp_send_json_error(['message' => 'Nonce verification failed.'], 403);
    }
    if (!isset($_POST['fields']) || !is_array($_POST['fields'])) {
        wp_send_json_error(['message' => 'Invalid form data.'], 400);
    }

    $raw_fields = $_POST['fields'];
    $sanitized_data_for_acf = []; // This will hold all data intended for ACF fields

    // 2. Sanitize Operator Name & Address (for ACF, WordPress Email, and Post Title)
    if (isset($raw_fields['operator_name'])) {
        $sanitized_data_for_acf['operator_name'] = sanitize_text_field($raw_fields['operator_name']);
        if (empty($sanitized_data_for_acf['operator_name'])) {
            wp_send_json_error(['message' => 'Operator Name is required.'], 400);
        }
    } else {
        wp_send_json_error(['message' => 'Operator Name is missing.'], 400);
    }

    if (isset($raw_fields['address_of_unit'])) {
        $sanitized_data_for_acf['address_of_unit'] = sanitize_text_field($raw_fields['address_of_unit']);
        if (empty($sanitized_data_for_acf['address_of_unit'])) {
            wp_send_json_error(['message' => 'Address of Unit is required.'], 400);
        }
    } else {
        wp_send_json_error(['message' => 'Address of Unit is missing.'], 400);
    }

    // 3. --- Process Fittings:
    //    - Sanitize all fitting data for ACF.
    //    - Extract photo URLs for Make.com, wrapping each URL in an object with a 'value' key.
    $all_photo_urls_for_make = [];
    $sanitized_data_for_acf['fittings'] = []; // Initialize for ACF

    if (isset($raw_fields['fittings']) && is_array($raw_fields['fittings'])) {
        foreach ($raw_fields['fittings'] as $index => $fitting_row) {
            if (!is_array($fitting_row)) {
                continue;
            }
            
            $current_acf_row = []; // Holds all sanitized data for one fitting row for ACF

            $current_acf_row['size_of_unit'] = isset($fitting_row['size_of_unit']) ? floatval($fitting_row['size_of_unit']) : 0;
            $current_acf_row['unit_of_measurement'] = isset($fitting_row['unit_of_measurement']) ? sanitize_text_field($fitting_row['unit_of_measurement']) : '';
            $current_acf_row['fitting_type'] = isset($fitting_row['fitting_type']) ? sanitize_text_field($fitting_row['fitting_type']) : '';
            $current_acf_row['additional_notes'] = isset($fitting_row['additional_notes']) ? sanitize_textarea_field($fitting_row['additional_notes']) : '';
            $current_acf_row['external_file_reference'] = isset($fitting_row['external_file_reference']) ? esc_url_raw($fitting_row['external_file_reference']) : '';

            // Initialize photo field for ACF
            $current_acf_row['photo'] = ''; 

            if (!empty($fitting_row['photo'])) {
                $uploadcare_url = esc_url_raw(trim($fitting_row['photo']));
                if (filter_var($uploadcare_url, FILTER_VALIDATE_URL) && strpos($uploadcare_url, 'ucarecdn.com') !== false) {
                    $current_acf_row['photo'] = $uploadcare_url; // Populate for ACF
                     $all_photo_urls_for_make[] = ['value' => $uploadcare_url]; // <<< THIS IS THE KEY PHP CHANGE
                }
                // If URL is invalid, $current_acf_row['photo'] remains '', which is correct for ACF.
            }
            // If $fitting_row['photo'] was empty, $current_acf_row['photo'] remains '', which is correct for ACF.
            
            $sanitized_data_for_acf['fittings'][] = $current_acf_row;
        }
    }

    // 4. Create WordPress Post
    $post_title_operator_part = !empty($sanitized_data_for_acf['operator_name']) ? $sanitized_data_for_acf['operator_name'] : 'Unknown Operator';
    $post_title = 'Job Quote - ' . $post_title_operator_part . ' - ' . current_time('Y-m-d H:i:s');
    $new_post_args = ['post_title' => sanitize_text_field($post_title), 'post_status' => 'publish', 'post_type' => 'job_quote'];
    $post_id = wp_insert_post($new_post_args, true);

    if (is_wp_error($post_id)) {
        wp_send_json_error(['message' => 'Error creating post: ' . $post_id->get_error_message()], 500);
    }

    // 5. Update ACF Fields with all sanitized data
    update_field('operator_name', $sanitized_data_for_acf['operator_name'], $post_id);
    update_field('address_of_unit', $sanitized_data_for_acf['address_of_unit'], $post_id);
    if (!empty($sanitized_data_for_acf['fittings'])) {
        update_field('fittings', $sanitized_data_for_acf['fittings'], $post_id);
    }

    // 6. Prepare and Send data to Make.com Webhook
    $make_webhook_url = 'https://hook.eu2.make.com/d4u3hy1494wv33vyuisubbzvl7nr472x'; // Your actual webhook URL

    $payload_for_make = [
        'submission_timestamp' => current_time('mysql'),
        'photo_urls'           => $all_photo_urls_for_make, // This is now an array of objects like [{'value': 'url1'}, {'value': 'url2'}]
        // 'post_id_wordpress'    => $post_id, // Optional: if Make.com needs it
        // 'operator_name'        => $sanitized_data_for_acf['operator_name'], // Optional: if Make.com needs it
    ];
    
    // Call the dedicated function to send data to Make.com
    jpm_send_data_to_make_webhook($payload_for_make, $make_webhook_url, $post_id);

    // 7. Send WordPress Email Notification (with full original details)
    jpm_send_wordpress_quote_email(
        $sanitized_data_for_acf['operator_name'], 
        $sanitized_data_for_acf['address_of_unit'], 
        isset($raw_fields['fittings']) && is_array($raw_fields['fittings']) ? $raw_fields['fittings'] : [], 
        $post_id
    );

    // 8. Send Success Response to Frontend
    wp_send_json_success(['message' => 'Quote submitted successfully!', 'post_id' => $post_id]);
}
add_action('wp_ajax_my_jq_form_submission', 'jpm_jq_handle_form_submission');
add_action('wp_ajax_nopriv_my_jq_form_submission', 'jpm_jq_handle_form_submission');

function jpm_jq_enqueue_form_assets() {
    global $post;
    if ( ! is_a( $post, 'WP_Post' ) || ! has_shortcode( $post->post_content, 'jpm_job_quote_form' ) ) { return; }

    wp_enqueue_style('my-jq-form-styles', plugin_dir_url( __FILE__ ) . 'assets/css/style.css', [], '1.0');


    wp_enqueue_script('my-jq-ui-script', plugin_dir_url( __FILE__ ) . 'assets/js/script.js', ['jquery', 'wp-util'], '1.0', true);
    wp_localize_script('my-jq-ui-script', 'jpmJQForm',
        array(
            'ajaxurl' => admin_url( 'admin-ajax.php' ),
            'add_fitting_template' => jq_get_fitting_template_html(),
            'uploadcare_pubkey' => '7b06642c34de8ca6b466' 
        )
    );
    wp_enqueue_script('my-jq-submission-script', plugin_dir_url( __FILE__ ) . 'assets/js/form-submission.js', ['jquery', 'my-jq-ui-script'], '1.0', true);
}
add_action( 'wp_enqueue_scripts', 'jpm_jq_enqueue_form_assets' );


function jpm_jq_form_shortcode() {
    ob_start();

    $unit_choices = jq_get_acf_select_choices_from_repeater( 'fittings', 'unit_of_measurement' );
    $fitting_type_choices = jq_get_acf_select_choices_from_repeater( 'fittings', 'fitting_type' );
    ?>
    <uc-config
        ctx-name="jpm-photo-uploader-0"
        pubkey="7b06642c34de8ca6b466"
        img-only="true"
        multiple="false"
        max-local-file-size-bytes="524288000"
        use-cloud-image-editor="true"
        source-list="local, url, camera, dropbox, gdrive"
        clearable="true">
    </uc-config>

    <div class="container jpm-jq-form">
        <div id="jpm-form-container">
            <form id="jpm-complex-form" class="job-quote-form" method="post" enctype="multipart/form-data">

                <div class="jq-form--ini-wrapper fitting-field-group" data-fitting-index="0"> 
                    <div class="jq-form jq-form--ini"> 
                        <div class="image-section">
                            <div class="img--one"><img src="https://c.animaapp.com/m9u0i2zzfWklB8/img/image.png" alt="Background Image"></div>
                            <div class="img--two"><img src="https://c.animaapp.com/m9u0i2zzfWklB8/img/image-1.png" alt="Foreman Image"></div>
                            <div class="logo-images">
                                <img src="https://c.animaapp.com/m9u0i2zzfWklB8/img/group-3.png" alt="JPM Logo Part 1">
                                <img src="https://c.animaapp.com/m9u0i2zzfWklB8/img/vector-3.svg" alt="JPM Logo Part 2">
                                <img src="https://c.animaapp.com/m9u0i2zzfWklB8/img/vector-4.svg" alt="JPM Logo Part 3">
                                <img src="https://c.animaapp.com/m9u0i2zzfWklB8/img/vector.svg" alt="JPM Logo Part 4">
                                <img src="https://c.animaapp.com/m9u0i2zzfWklB8/img/group-4.png" alt="JPM Logo Part 5">
                            </div>
                        </div>
                        <div class="jq-form-fields-wrapper">
                            <h2 id="form-title">JPM Job Quote Submission <span class="fitting-number-initial" style="font-weight:normal; font-size:0.8em;">(Fitting #1)</span></h2>
                            <div class="form-section initial-fields">
                                <p class="form-group">
                                    <label for="operator_name">Operator Name:</label><br>
                                    <input type="text" id="operator_name" name="fields[operator_name]" required placeholder="Operator Name">
                                </p>
                                <p class="form-group">
                                    <label for="address_of_unit">Address of unit:</label><br>
                                    <input type="text" id="address_of_unit" name="fields[address_of_unit]" required placeholder="Address of unit">
                                </p>
                            </div>
                            <div class="fitting-sub-fields"> 
                                <div class="unit-group">
                                    <p class="form-group">
                                        <label for="fitting_size_of_unit_0">Size of Unit:</label><br>
                                        <input type="text" id="fitting_size_of_unit_0" class="fitting-field fitting-size-of-unit"
                                            name="fields[fittings][0][size_of_unit]" placeholder="Size of Unit">
                                    </p>
                                    <p class="form-group">
                                        <label for="fitting_unit_of_measurement_0">Unit of measurement:</label><br>
                                        <select id="fitting_unit_of_measurement_0" class="fitting-field fitting-unit-of-measurement"
                                            name="fields[fittings][0][unit_of_measurement]">
                                            <option value="">-- Select Unit --</option>
                                            <?php if ( ! empty( $unit_choices ) ) : foreach ( $unit_choices as $value => $label ) : ?>
                                            <option value="<?php echo esc_attr( $value ); ?>"><?php echo esc_html( $label ); ?></option>
                                            <?php endforeach; else: ?>
                                            <option value="feet">Feet (Fallback)</option>
                                            <option value="meter">Meters (Fallback)</option>
                                            <?php endif; ?>
                                        </select>
                                    </p>
                                </div>
                                <p class="form-group">
                                    <label for="fitting_fitting_type_0">Fitting Type:</label><br>
                                    <select id="fitting_fitting_type_0" class="fitting-field fitting-fitting-type" name="fields[fittings][0][fitting_type]">
                                        <option value="">-- Select a fitting --</option>
                                        <?php if ( ! empty( $fitting_type_choices ) ) : foreach ( $fitting_type_choices as $value => $label ) : ?>
                                        <option value="<?php echo esc_attr( $value ); ?>"><?php echo esc_html( $label ); ?></option>
                                        <?php endforeach; else: ?>
                                        <option value="led_panel">LED Panel</option>
                                        <option value="emergency_light">Emergency Light</option>
                                        <option value="other">Other</option>
                                        <?php endif; ?>
                                    </select>
                                </p>
                                <p class="form-group">
                                    <label for="fitting_additional_notes_0">Additional Notes:</label><br>
                                    <textarea id="fitting_additional_notes_0" class="fitting-field fitting-additional-notes"
                                        name="fields[fittings][0][additional_notes]" rows="4"
                                        placeholder="Enter any additional job details"></textarea>
                                </p>
                                <p class="form-group">
                                    <label for="fitting_external_file_reference_0">External File Reference (Optional):</label><br>
                                    <input type="text" id="fitting_external_file_reference_0" class="fitting-field fitting-external-file-reference"
                                        name="fields[fittings][0][external_file_reference]" placeholder="e.g., URL">
                                </p>
                                <div class="jq-file-btn-group">
                                    <div class="form-group file-upload-group">
                                        <label class="d-block">Upload/Take Photo (via Uploadcare):</label><br>
                                        <uc-file-uploader-regular ctx-name="jpm-photo-uploader-0"
                                        css-src="https://cdn.jsdelivr.net/npm/@uploadcare/file-uploader@v1/web/uc-file-uploader.min.css">
                                            <uc-form-input ctx-name="jpm-photo-uploader-0"> </uc-form-input>
                                        </uc-file-uploader-regular>
                                        
                                    </div>
                                    <div class="separator"></div>
                                    <div class="form-actions button-group main-action-buttons">
                                        <button type="button" class="button secondary add-another-fitting-button">Add Another Fitting</button>
                                        <?php wp_nonce_field( 'my_complex_form_nonce_action', 'my_complex_form_nonce_field' ); ?>
                                        <button type="submit" class="button jq-button" id="send-quote-button" name="my_complex_form_submit">Send Quote</button>
                                    </div>
                                </div>
                            </div>
                            <div id="form-messages" style="margin-top: 20px;"></div>
                        </div> 
                    </div> 
                </div>

                <div id="fittings-container">
                </div>
            </form>
        </div>
    </div>
    <?php
    return ob_get_clean();
}
add_shortcode( 'jpm_job_quote_form', 'jpm_jq_form_shortcode' );


function jq_get_fitting_template_html() {
    ob_start();


    $unit_choices = jq_get_acf_select_choices_from_repeater( 'fittings', 'unit_of_measurement' );
    $fitting_type_choices = jq_get_acf_select_choices_from_repeater( 'fittings', 'fitting_type' );
    ?>
    

    <div class="jq-form--ini-wrapper jq-form-temp form-section fitting-fields" data-fitting-index="__INDEX__">
        <uc-config
            ctx-name="jpm-photo-uploader-__INDEX__"
            pubkey="7b06642c34de8ca6b466"
            img-only="true"
            multiple="false"
            max-local-file-size-bytes="524288000"
            use-cloud-image-editor="true"
            source-list="local, url, camera, dropbox, gdrive"
            clearable="true">
        </uc-config>
        <div class="jq-form jq-form--ini">
            <div class="image-section">
                
                <div class="img--one"><img src="https://c.animaapp.com/m9u0i2zzfWklB8/img/image.png" alt="Background Image"></div>
                <div class="img--two"><img src="https://c.animaapp.com/m9u0i2zzfWklB8/img/image-1.png" alt="Foreman Image"></div>
                <div class="logo-images">
                    <img src="https://c.animaapp.com/m9u0i2zzfWklB8/img/group-3.png" alt="JPM Logo Part 1">
                    <img src="https://c.animaapp.com/m9u0i2zzfWklB8/img/vector-3.svg" alt="JPM Logo Part 2">
                    <img src="https://c.animaapp.com/m9u0i2zzfWklB8/img/vector-4.svg" alt="JPM Logo Part 3">
                    <img src="https://c.animaapp.com/m9u0i2zzfWklB8/img/vector.svg" alt="JPM Logo Part 4">
                    <img src="https://c.animaapp.com/m9u0i2zzfWklB8/img/group-4.png" alt="JPM Logo Part 5">
                </div>
            </div>
            <div class="jq-form-fields-wrapper">
                
                <h2 class="form-title-repeated">JPM Job Quote Submission Fitting #<span class="fitting-number">__NUMBER__</span></h2>

                <div class="form-section initial-fields repeated-initial-fields">
                    <p class="form-group repeated-operator-name">
                        <label>Operator Name:</label><br>
                        <input type="text" class="readonly-operator-name" name="fields[fittings][__INDEX__][operator_name_display]" readonly> 
                    </p>
                    <p class="form-group repeated-address-of-unit">
                        <label>Address of unit:</label><br>
                        <input type="text" class="readonly-address-of-unit" name="fields[fittings][__INDEX__][address_of_unit_display]" readonly> 
                    </p>
                </div>

                <div class="fitting-sub-fields">
                    <div class="unit-group">
                        <p class="form-group">
                            <label for="fitting-size-of-unit___INDEX__">Size of Unit:</label><br>
                            <input type="text" id="fitting-size-of-unit___INDEX__" class="fitting-field fitting-size-of-unit"
                                name="fields[fittings][__INDEX__][size_of_unit]" placeholder="Size of Unit">
                        </p>
                        <p class="form-group">
                            <label for="fitting-unit-of-measurement___INDEX__">Unit of measurement:</label><br>
                            <select id="fitting-unit-of-measurement___INDEX__" class="fitting-field fitting-unit-of-measurement"
                                name="fields[fittings][__INDEX__][unit_of_measurement]">
                                <option value="">-- Select Unit --</option>
                                <?php if ( ! empty( $unit_choices ) ) : foreach ( $unit_choices as $value => $label ) : ?>
                                <option value="<?php echo esc_attr( $value ); ?>"><?php echo esc_html( $label ); ?></option>
                                <?php endforeach; else: ?>
                                <option value="feet">Feet</option>
                                <option value="meter">Meters</option>
                                <?php endif; ?>
                            </select>
                        </p>
                    </div>
                    <p class="form-group">
                        <label for="fitting-fitting-type___INDEX__">Fitting Type:</label><br>
                        <select id="fitting-fitting-type___INDEX__" class="fitting-field fitting-fitting-type" name="fields[fittings][__INDEX__][fitting_type]">
                            <option value="">-- Select a fitting --</option>
                            <?php if ( ! empty( $fitting_type_choices ) ) : foreach ( $fitting_type_choices as $value => $label ) : ?>
                            <option value="<?php echo esc_attr( $value ); ?>"><?php echo esc_html( $label ); ?></option>
                            <?php endforeach; else: ?>
                            <option value="led_panel">LED Panel</option>
                            <option value="emergency_light">Emergency Light</option>
                            <option value="other">Other</option>
                            <?php endif; ?>
                        </select>
                    </p>
                    <p class="form-group">
                        <label for="fitting-additional-notes___INDEX__">Additional Notes:</label><br>
                        <textarea id="fitting-additional-notes___INDEX__" class="fitting-field fitting-additional-notes"
                            name="fields[fittings][__INDEX__][additional_notes]" rows="4"
                            placeholder="Enter any additional job details"></textarea>
                    </p>
                     <p class="form-group">
                        <label for="fitting-external-file-reference___INDEX__">External File Reference (Optional):</label><br>
                        <input type="text" id="fitting-external-file-reference___INDEX__" class="fitting-field fitting-external-file-reference"
                            name="fields[fittings][__INDEX__][external_file_reference]" placeholder="e.g., URL">
                    </p>
                    <div class="jq-file-btn-group">
                        <div class="form-group file-upload-group">
                            <label class="d-block">Upload/Take Photo (via Uploadcare):</label><br>
                            <uc-file-uploader-regular ctx-name="jpm-photo-uploader-__INDEX__" >
                                <uc-form-input ctx-name="jpm-photo-uploader-__INDEX__" ></uc-form-input>
                            </uc-file-uploader-regular>
                            
                        </div>
                        <div class="separator"></div>
                        <div class="form-actions button-group template-action-buttons"> 
                            <button type="button" class="button secondary add-another-fitting-button">Add Another Fitting</button>
                            
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>
    <?php
    return ob_get_clean();
}

?>