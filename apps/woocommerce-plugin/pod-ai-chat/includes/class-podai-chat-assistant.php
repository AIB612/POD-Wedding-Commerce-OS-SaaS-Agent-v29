<?php
/**
 * WP admin: Pod.AI Chat → Assistant (the merchant assistant, Pod.AI's internal agent).
 *
 * The page talks to admin-ajax.php (action podai_chat_assistant). This class checks the capability and the nonce, then
 * forwards the request to Pod.AI with the site's signed client (the site secret never reaches the browser).
 * Changes the assistant prepares (knowledge answers, ticket status / notes, chat on/off) only run after a click on
 * Confirm, which sends { confirm: true }. The assistant never changes WooCommerce orders, products or customers.
 *
 * @package PodAIChat
 */

defined( 'ABSPATH' ) || exit;

/**
 * Assistant page + AJAX proxy.
 */
class PodAI_Chat_Assistant {

	const SLUG   = 'pod-ai-chat-assistant';
	const ACTION = 'podai_chat_assistant';

	/**
	 * Hooks.
	 */
	public static function init() {
		add_action( 'admin_menu', array( __CLASS__, 'menu' ), 20 );
		add_action( 'admin_enqueue_scripts', array( __CLASS__, 'assets' ) );
		add_action( 'wp_ajax_' . self::ACTION, array( __CLASS__, 'ajax' ) );
	}

	/**
	 * Submenu under Pod.AI Chat.
	 */
	public static function menu() {
		add_submenu_page( 'pod-ai-chat', __( 'Assistant', 'pod-ai-chat' ), __( 'Assistant', 'pod-ai-chat' ), PodAI_Chat_Admin::CAP, self::SLUG, array( __CLASS__, 'page' ) );
	}

	/**
	 * Admin language for the assistant's replies (en, de, fr, it, zh).
	 *
	 * @return string
	 */
	public static function lang() {
		$l = strtolower( substr( (string) get_user_locale(), 0, 2 ) );
		return in_array( $l, array( 'en', 'de', 'fr', 'it', 'zh' ), true ) ? $l : 'en';
	}

	/**
	 * Script + styles, only on the assistant page.
	 *
	 * @param string $hook Admin page hook.
	 */
	public static function assets( $hook ) {
		if ( false === strpos( (string) $hook, self::SLUG ) ) {
			return;
		}
		wp_enqueue_style( 'podai-chat-assistant', PODAI_CHAT_URL . 'assets/css/assistant.css', array(), PODAI_CHAT_VERSION );
		wp_enqueue_script( 'podai-chat-assistant', PODAI_CHAT_URL . 'assets/js/assistant.js', array(), PODAI_CHAT_VERSION, true );
		wp_localize_script(
			'podai-chat-assistant',
			'PodAIAssistant',
			array(
				'ajax'  => admin_url( 'admin-ajax.php' ),
				'nonce' => wp_create_nonce( self::ACTION ),
				'lang'  => self::lang(),
				'i18n'  => self::strings(),
			)
		);
	}

	/**
	 * Translated UI strings for the script.
	 *
	 * @return array
	 */
	private static function strings() {
		return array(
			'q1'        => __( 'What needs my attention today?', 'pod-ai-chat' ),
			'q2'        => __( 'Unanswered questions', 'pod-ai-chat' ),
			'q3'        => __( 'Open tickets', 'pod-ai-chat' ),
			'q4'        => __( 'KPIs last 30 days', 'pod-ai-chat' ),
			'q5'        => __( 'What do shoppers ask about?', 'pod-ai-chat' ),
			'draft'     => __( 'Draft answers', 'pod-ai-chat' ),
			'edit'      => __( 'Edit', 'pod-ai-chat' ),
			'source'    => __( 'Source:', 'pod-ai-chat' ),
			'before'    => __( 'Now:', 'pod-ai-chat' ),
			'ok'        => __( 'Confirm', 'pod-ai-chat' ),
			'no'        => __( 'Reject', 'pod-ai-chat' ),
			'none'      => __( 'Nothing waiting. When the assistant prepares a change, it appears here.', 'pod-ai-chat' ),
			'done'      => __( 'Done', 'pod-ai-chat' ),
			'failed'    => __( 'Not done', 'pod-ai-chat' ),
			'rejected'  => __( 'Rejected', 'pod-ai-chat' ),
			'expired'   => __( 'Expired', 'pod-ai-chat' ),
			'running'   => __( 'Running', 'pod-ai-chat' ),
			'proposed'  => __( 'Waiting', 'pod-ai-chat' ),
			'copy'      => __( 'Copy draft', 'pod-ai-chat' ),
			'mail'      => __( 'Open in e-mail', 'pod-ai-chat' ),
			'teach'     => __( 'Teach answer', 'pod-ai-chat' ),
			'teachHint' => __( 'Type the answer between the last quotes, then press Enter.', 'pod-ai-chat' ),
			'show'      => __( 'Show', 'pod-ai-chat' ),
			'copied'    => __( 'Copied', 'pod-ai-chat' ),
			'rules'     => __( 'Rules', 'pod-ai-chat' ),
			'llm'       => __( 'AI planner', 'pod-ai-chat' ),
			'err'       => __( 'The assistant could not answer right now.', 'pod-ai-chat' ),
			'customer'  => __( 'Customer', 'pod-ai-chat' ),
			'ai'        => __( 'Assistant', 'pod-ai-chat' ),
			'tools'     => array(
				'add_knowledge'     => __( 'Add knowledge entry', 'pod-ai-chat' ),
				'delete_knowledge'  => __( 'Delete knowledge entry', 'pod-ai-chat' ),
				'set_ticket_status' => __( 'Change ticket status', 'pod-ai-chat' ),
				'add_ticket_note'   => __( 'Add ticket note', 'pod-ai-chat' ),
				'set_chat_enabled'  => __( 'Turn chat on / off', 'pod-ai-chat' ),
				'set_weekly_digest' => __( 'Weekly e-mail on / off', 'pod-ai-chat' ),
			),
			'events'    => array(
				'ask'      => __( 'Question', 'pod-ai-chat' ),
				'proposed' => __( 'Prepared', 'pod-ai-chat' ),
				'approved' => __( 'Confirmed', 'pod-ai-chat' ),
				'executed' => __( 'Done', 'pod-ai-chat' ),
				'failed'   => __( 'Failed', 'pod-ai-chat' ),
				'rejected' => __( 'Rejected', 'pod-ai-chat' ),
				'digest'   => __( 'Weekly e-mail', 'pod-ai-chat' ),
			),
		);
	}

	/**
	 * Page markup (the script fills it).
	 */
	public static function page() {
		if ( ! current_user_can( PodAI_Chat_Admin::CAP ) ) {
			return;
		}
		echo '<div class="wrap podai-as"><h1>' . esc_html__( 'Pod.AI assistant', 'pod-ai-chat' ) . ' <span class="podai-as-mode" id="podai-as-mode" hidden></span></h1>';
		if ( ! PodAI_Chat_Plugin::connected() ) {
			echo '<p>' . esc_html__( 'Connect Pod.AI first (Pod.AI Chat → Settings).', 'pod-ai-chat' ) . '</p></div>';
			return;
		}
		echo '<p class="description">' . esc_html__( 'Ask about your chats, tickets and knowledge. Changes are only prepared — nothing happens until you confirm.', 'pod-ai-chat' ) . '</p>';
		echo '<div class="podai-as-grid"><div class="podai-as-main card">';
		echo '<div class="podai-as-quick" id="podai-as-quick"></div>';
		echo '<div class="podai-as-log" id="podai-as-log" aria-live="polite"></div>';
		echo '<form class="podai-as-form" id="podai-as-form"><label class="screen-reader-text" for="podai-as-in">' . esc_html__( 'Ask the assistant', 'pod-ai-chat' ) . '</label>';
		echo '<input type="text" id="podai-as-in" class="regular-text" maxlength="2000" autocomplete="off" placeholder="' . esc_attr__( 'e.g. What needs my attention today?', 'pod-ai-chat' ) . '">';
		echo '<button type="submit" class="button button-primary">' . esc_html__( 'Ask', 'pod-ai-chat' ) . '</button></form></div>';
		echo '<div class="podai-as-side"><div class="card"><h2>' . esc_html__( 'Waiting for your confirmation', 'pod-ai-chat' ) . ' <span class="podai-as-count" id="podai-as-n">0</span></h2><div id="podai-as-queue"></div></div>';
		echo '<div class="card"><h2>' . esc_html__( 'Recent activity', 'pod-ai-chat' ) . '</h2><ul class="podai-as-audit" id="podai-as-audit"></ul>';
		echo '<p class="description">' . esc_html__( 'Pod.AI only changes its own data (knowledge, tickets, chat on/off). Your store, orders and products are never changed.', 'pod-ai-chat' ) . ' ';
		echo esc_html__( 'Answers you teach here are kept next to the FAQ in Settings; an FAQ entry with the same question replaces them.', 'pod-ai-chat' ) . '</p></div></div></div></div>';
	}

	/**
	 * AJAX proxy: op = ask | actions | approve | reject | audit.
	 */
	public static function ajax() {
		if ( ! current_user_can( PodAI_Chat_Admin::CAP ) ) {
			wp_send_json_error( array( 'error' => 'forbidden' ), 403 );
		}
		check_ajax_referer( self::ACTION, 'nonce' );
		$op    = isset( $_POST['op'] ) ? sanitize_key( wp_unslash( $_POST['op'] ) ) : '';
		$id    = isset( $_POST['id'] ) ? sanitize_key( wp_unslash( $_POST['id'] ) ) : '';
		$user  = wp_get_current_user();
		$actor = $user && $user->exists() ? sanitize_user( $user->user_login, true ) : '';
		$base  = array(
			'lang'  => self::lang(),
			'actor' => $actor,
		);
		switch ( $op ) {
			case 'ask':
				$message = isset( $_POST['message'] ) ? sanitize_textarea_field( wp_unslash( $_POST['message'] ) ) : '';
				if ( '' === trim( $message ) ) {
					wp_send_json_error( array( 'error' => 'message_required' ), 400 );
				}
				$res = PodAI_Chat_Client::request( 'POST', 'assistant', array_merge( $base, array( 'message' => mb_substr( $message, 0, 2000 ) ) ), 30 );
				break;
			case 'actions':
				$res = PodAI_Chat_Client::request( 'GET', 'assistant/actions?status=proposed', null, 15 );
				break;
			case 'audit':
				$res = PodAI_Chat_Client::request( 'GET', 'assistant/audit?limit=12', null, 15 );
				break;
			case 'approve':
			case 'reject':
				if ( ! preg_match( '/^act_[a-f0-9]{12}$/', $id ) ) {
					wp_send_json_error( array( 'error' => 'action_not_found' ), 400 );
				}
				$body = 'approve' === $op ? array_merge( $base, array( 'confirm' => true ) ) : $base;
				$res  = PodAI_Chat_Client::request( 'POST', 'assistant/actions/' . $id . '/' . $op, $body, 30 );
				break;
			default:
				wp_send_json_error( array( 'error' => 'unknown_op' ), 400 );
		}
		if ( is_wp_error( $res ) ) {
			$data = $res->get_error_data();
			wp_send_json_error( array( 'error' => $res->get_error_message() ), is_array( $data ) && ! empty( $data['status'] ) ? (int) $data['status'] : 502 );
		}
		wp_send_json_success( $res );
	}
}
