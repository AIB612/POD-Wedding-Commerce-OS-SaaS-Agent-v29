<?php
/**
 * Uninstall: delete this site's data at Pod.AI (if still connected), then all local options, transients and cron jobs.
 *
 * @package PodAIChat
 */

defined( 'WP_UNINSTALL_PLUGIN' ) || exit;

// An older copy of this plugin (folder pod-ai-chat, up to 1.2.0) shares the same settings: keep everything while it is installed.
if ( file_exists( WP_PLUGIN_DIR . '/pod-ai-chat/pod-ai-chat.php' ) ) {
	return;
}

$podai_chat_connection = get_option( 'podai_chat_connection', array() );
$podai_chat_settings   = get_option( 'podai_chat_settings', array() );
if ( ! is_array( $podai_chat_connection ) ) {
	$podai_chat_connection = array();
}
if ( ( empty( $podai_chat_connection['site_id'] ) || empty( $podai_chat_connection['secret'] ) ) && is_array( $podai_chat_settings ) ) {
	$podai_chat_connection = array_merge( $podai_chat_connection, $podai_chat_settings );
}
if ( ! empty( $podai_chat_connection['site_id'] ) && ! empty( $podai_chat_connection['secret'] ) ) {
	require_once __DIR__ . '/includes/class-podai-chat-client.php';
	require_once __DIR__ . '/includes/class-podai-chat-plugin.php';
	if ( ! defined( 'PODAI_CHAT_BACKEND' ) ) {
		define( 'PODAI_CHAT_BACKEND', 'https://podai.swisspro.site' );
	}
	PodAI_Chat_Client::request( 'POST', 'disconnect', array(), 10 );
}
delete_option( 'podai_chat_settings' );
delete_option( 'podai_chat_connection' );
delete_transient( 'podai_chat_config' );
delete_transient( 'podai_chat_verify_nonce' );
wp_clear_scheduled_hook( 'podai_chat_full_sync' );
wp_clear_scheduled_hook( 'podai_chat_sync_batch' );
global $wpdb;
// Rate-limit / nonce transients (podai_rl_*, podai_n_*).
$wpdb->query( "DELETE FROM {$wpdb->options} WHERE option_name LIKE '\\_transient\\_podai\\_%' OR option_name LIKE '\\_transient\\_timeout\\_podai\\_%'" ); // phpcs:ignore WordPress.DB.DirectDatabaseQuery
