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

function jpm_generate_html_email_body($operator_name, $address_of_unit, $all_fittings_raw_data, $post_id = null) {
    $html_body_lines = [];
    $unit_of_measurement_choices = jq_get_acf_select_choices_from_repeater('fittings', 'unit_of_measurement');
    $fitting_type_choices = jq_get_acf_select_choices_from_repeater('fittings', 'fitting_type');

    $html_body_lines[] = "<strong>Operator Name:</strong> " . esc_html($operator_name);
    $html_body_lines[] = "<strong>Address of Unit:</strong> " . esc_html($address_of_unit);

    if (!empty($all_fittings_raw_data) && is_array($all_fittings_raw_data)) {
        $fittings_section_html_parts = []; // To store HTML for each fitting block
        foreach ($all_fittings_raw_data as $index => $fitting_row) {
            if (!is_array($fitting_row)) {
                continue;
            }
            $current_fitting_html_lines = ["<strong>Fitting #" . ($index + 1) . ":</strong>"];

            $current_fitting_html_lines[] = "  Size of Unit: " . esc_html(isset($fitting_row['size_of_unit']) ? (string)floatval($fitting_row['size_of_unit']) : '0');
            
            $unit_value = isset($fitting_row['unit_of_measurement']) ? sanitize_text_field($fitting_row['unit_of_measurement']) : '';
            $unit_label = isset($unit_of_measurement_choices[$unit_value]) ? $unit_of_measurement_choices[$unit_value] : $unit_value;
            $current_fitting_html_lines[] = "  Unit of Measurement: " . esc_html($unit_label);
            
            $type_value = isset($fitting_row['fitting_type']) ? sanitize_text_field($fitting_row['fitting_type']) : '';
            $type_label = isset($fitting_type_choices[$type_value]) ? $fitting_type_choices[$type_value] : $type_value;
            $current_fitting_html_lines[] = "  Fitting Type: " . esc_html($type_label);
            
            $current_fitting_html_lines[] = "  Additional Notes: " . nl2br(esc_html(isset($fitting_row['additional_notes']) ? sanitize_textarea_field($fitting_row['additional_notes']) : ''));

            $photo_cdn_url_from_form = isset($fitting_row['photo']) ? trim($fitting_row['photo']) : '';
            $original_filename_from_form = isset($fitting_row['photo_original_filename']) ? trim($fitting_row['photo_original_filename']) : '';

            if (!empty($photo_cdn_url_from_form)) {
                $uploadcare_url = esc_url_raw($photo_cdn_url_from_form);
                if (filter_var($uploadcare_url, FILTER_VALIDATE_URL) && strpos($uploadcare_url, 'ucarecdn.com') !== false) {
                    $link_text = !empty($original_filename_from_form) ? esc_html($original_filename_from_form) : esc_url($uploadcare_url);
                    $current_fitting_html_lines[] = "  Photo: <a href='" . esc_url($uploadcare_url) . "' target='_blank'>" . $link_text . "</a>";
                } else {
                    $current_fitting_html_lines[] = "  Photo: Invalid URL" . (!empty($original_filename_from_form) ? ' for ' . esc_html($original_filename_from_form) : '');
                }
            } else {
                $current_fitting_html_lines[] = "  Photo: Not provided";
            }
            $fittings_section_html_parts[] = implode("<br>\n", $current_fitting_html_lines);
        }
        if (!empty($fittings_section_html_parts)) {
            $html_body_lines[] = "<br><strong>Fittings Details:</strong><br>" . implode("<br><br>\n", $fittings_section_html_parts);
        }
    }

    return "New job quote submission details:<br><br>" . implode("<br>\n", $html_body_lines);
}

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
    $sanitized_data_for_acf = [];

    // 2. Sanitize Operator Name & Address
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

    // 3. Process Fittings for ACF and for Make.com photo payload
    $all_photos_info_for_make = []; 
    $sanitized_data_for_acf['fittings'] = [];

    if (isset($raw_fields['fittings']) && is_array($raw_fields['fittings'])) {
        foreach ($raw_fields['fittings'] as $index => $fitting_row) {
            if (!is_array($fitting_row)) continue;
            
            $current_acf_row = [];
            $current_acf_row['size_of_unit'] = isset($fitting_row['size_of_unit']) ? floatval($fitting_row['size_of_unit']) : 0;
            $current_acf_row['unit_of_measurement'] = isset($fitting_row['unit_of_measurement']) ? sanitize_text_field($fitting_row['unit_of_measurement']) : '';
            $current_acf_row['fitting_type'] = isset($fitting_row['fitting_type']) ? sanitize_text_field($fitting_row['fitting_type']) : '';
            $current_acf_row['additional_notes'] = isset($fitting_row['additional_notes']) ? sanitize_textarea_field($fitting_row['additional_notes']) : '';

            $current_acf_row['photo'] = ''; 
            $photo_cdn_url_from_form = isset($fitting_row['photo']) ? trim($fitting_row['photo']) : '';
            $original_filename_from_form = isset($fitting_row['photo_original_filename']) ? trim($fitting_row['photo_original_filename']) : '';

            if (!empty($photo_cdn_url_from_form)) {
                $uploadcare_url = esc_url_raw($photo_cdn_url_from_form);
                if (filter_var($uploadcare_url, FILTER_VALIDATE_URL) && strpos($uploadcare_url, 'ucarecdn.com') !== false) {
                    $current_acf_row['photo'] = $uploadcare_url;

                    $filename_for_make = !empty($original_filename_from_form)
                                       ? sanitize_file_name($original_filename_from_form)
                                       : 'photo_' . substr(basename($uploadcare_url), 0, 8) . '.jpg'; // Fallback
                    $all_photos_info_for_make[] = [
                        'url' => $uploadcare_url,
                        'filename' => $filename_for_make
                    ];
                }
            }
            $sanitized_data_for_acf['fittings'][] = $current_acf_row;
        }
    }

    // 4. Create WordPress Post
    $post_title = 'Job Quote - ' . ($sanitized_data_for_acf['operator_name'] ?? 'Unknown') . ' - ' . current_time('Y-m-d H:i:s');
    $new_post_args = ['post_title' => sanitize_text_field($post_title), 'post_status' => 'publish', 'post_type' => 'job_quote'];
    $post_id = wp_insert_post($new_post_args, true);

    if (is_wp_error($post_id)) {
        wp_send_json_error(['message' => 'Error creating post: ' . $post_id->get_error_message()], 500);
    }

    // 5. Update ACF Fields
    update_field('operator_name', $sanitized_data_for_acf['operator_name'], $post_id);
    update_field('address_of_unit', $sanitized_data_for_acf['address_of_unit'], $post_id);
    if (!empty($sanitized_data_for_acf['fittings'])) {
        update_field('fittings', $sanitized_data_for_acf['fittings'], $post_id);
    }

    // 6. Generate HTML Email Body (for Make.com and potentially WordPress email)
    $html_email_body_for_make_and_wp = jpm_generate_html_email_body(
        $sanitized_data_for_acf['operator_name'],
        $sanitized_data_for_acf['address_of_unit'],
        isset($raw_fields['fittings']) && is_array($raw_fields['fittings']) ? $raw_fields['fittings'] : [],
        $post_id
    );

    // 7. Prepare and Send data to Make.com Webhook
    $make_webhook_url = 'https://hook.eu2.make.com/d4u3hy1494wv33vyuisubbzvl7nr472x'; 

    $payload_for_make = [
        'submission_timestamp'     => current_time('mysql'),
        'photos'                   => $all_photos_info_for_make, 
        'email_body_for_reference' => $html_email_body_for_make_and_wp,
        'operator_name'            => $sanitized_data_for_acf['operator_name'], // Sending these too
        'address_of_unit'          => $sanitized_data_for_acf['address_of_unit'],
        'post_id_wordpress'        => $post_id
    ];
    
    jpm_send_data_to_make_webhook($payload_for_make, $make_webhook_url, $post_id);

    // 9. Send Success Response to Frontend
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
    
    <div class="container jpm-jq-form">
        <div id="jpm-form-container">
            <form id="jpm-complex-form" class="job-quote-form" method="post" enctype="multipart/form-data">
                 
                <div class="jq-form--ini-wrapper fitting-field-group" data-fitting-index="0"> 
                    <uc-config
                        ctx-name="jpm-photo-uploader-0"
                        pubkey="7b06642c34de8ca6b466"
                        img-only="true"
                        multiple="false"
                        max-local-file-size-bytes="524288000"
                        use-cloud-image-editor="false"
                        source-list="local, camera, gdrive"
                        clearable="true">
                    </uc-config>
                    <!-- Add the provider for the first uploader's context -->
                    <uc-upload-ctx-provider ctx-name="jpm-photo-uploader-0"></uc-upload-ctx-provider>
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
                            <h2 id="form-title">JPM Job Quote Submission</h2>
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
                                <div class="jq-file-btn-group">
                                    <div class="form-group file-upload-group">
                                        <label class="d-block">Upload/Take Photo (via Uploadcare):</label><br>
                                        <uc-file-uploader-regular ctx-name="jpm-photo-uploader-0"
                                        css-src="https://cdn.jsdelivr.net/npm/@uploadcare/file-uploader@v1/web/uc-file-uploader.min.css">
                                            <uc-form-input ctx-name="jpm-photo-uploader-0"> </uc-form-input>
                                            <input type="hidden" class="original-filename-input" name="fields[fittings][0][photo_original_filename]" value="">
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
                            <div id="form-messages">
                                
                            </div>
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
            use-cloud-image-editor="false"
            source-list="local, camera, gdrive"
            clearable="true">
        </uc-config>
        <uc-upload-ctx-provider ctx-name="jpm-photo-uploader-__INDEX__"></uc-upload-ctx-provider>
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
                    <div class="jq-file-btn-group">
                        <div class="form-group file-upload-group">
                            <label class="d-block">Upload/Take Photo (via Uploadcare):</label><br>
                            <uc-file-uploader-regular ctx-name="jpm-photo-uploader-__INDEX__" >
                                <uc-form-input ctx-name="jpm-photo-uploader-__INDEX__" ></uc-form-input>
                                <input type="hidden" class="original-filename-input" name="fields[fittings][__INDEX__][photo_original_filename]" value="">
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
            </div>
        </div>
    </div>
    <?php
    return ob_get_clean();
}

?>