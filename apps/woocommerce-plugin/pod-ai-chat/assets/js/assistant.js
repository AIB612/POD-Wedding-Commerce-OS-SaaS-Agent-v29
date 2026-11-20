/**
 * Pod.AI Chat → Assistant (WP admin). Talks only to admin-ajax.php (nonce + capability checked in PHP, request signed
 * there); renders replies, cards, proposals with Confirm / Reject, and recent activity. All text is inserted as text.
 *
 * @package PodAIChat
 */
( function () {
	'use strict';
	var C = window.PodAIAssistant;
	if ( ! C || ! document.getElementById( 'podai-as-log' ) ) {
		return;
	}
	var t = C.i18n;
	var log = document.getElementById( 'podai-as-log' );
	var input = document.getElementById( 'podai-as-in' );

	function el( tag, cls, text ) {
		var e = document.createElement( tag );
		if ( cls ) {
			e.className = cls;
		}
		if ( text !== undefined && text !== null ) {
			e.textContent = String( text );
		}
		return e;
	}
	function btn( label, cls, onClick ) {
		var b = el( 'button', 'button ' + ( cls || '' ), label );
		b.type = 'button';
		b.addEventListener( 'click', onClick );
		return b;
	}
	function scroll() {
		log.scrollTop = log.scrollHeight;
	}
	function add( node ) {
		log.appendChild( node );
		scroll();
		return node;
	}
	function time( v ) {
		return String( v || '' ).replace( 'T', ' ' ).slice( 0, 16 );
	}
	function call( op, data ) {
		var body = new URLSearchParams();
		body.set( 'action', 'podai_chat_assistant' );
		body.set( 'nonce', C.nonce );
		body.set( 'op', op );
		Object.keys( data || {} ).forEach( function ( k ) {
			body.set( k, data[ k ] );
		} );
		return fetch( C.ajax, { method: 'POST', credentials: 'same-origin', body: body } ).then( function ( r ) {
			return r.json().catch( function () {
				return { success: false, data: { error: 'http_' + r.status } };
			} );
		} ).then( function ( j ) {
			if ( ! j || ! j.success ) {
				throw new Error( ( j && j.data && j.data.error ) || 'error' );
			}
			return j.data;
		} );
	}

	// ---- proposals ----
	function actionCard( a ) {
		var c = el( 'div', 'podai-as-act' );
		c.setAttribute( 'data-act', a.id );
		c.appendChild( el( 'strong', '', ( t.tools && t.tools[ a.tool ] ) || a.tool ) );
		c.appendChild( el( 'div', '', ( a.preview && a.preview.summary ) || '' ) );
		if ( a.preview && a.preview.before ) {
			c.appendChild( el( 'div', 'description', a.preview.before ) );
		}
		var row = el( 'div', 'podai-as-btns' );
		if ( 'proposed' === a.status ) {
			row.appendChild( btn( t.ok, 'button-primary', function () {
				decide( a.id, 'approve' );
			} ) );
			row.appendChild( btn( t.no, '', function () {
				decide( a.id, 'reject' );
			} ) );
		} else {
			row.appendChild( el( 'span', 'podai-as-badge is-' + a.status, ( t[ a.status ] || a.status ) + ( a.error ? ' · ' + a.error.replace( /_/g, ' ' ) : '' ) ) );
		}
		c.appendChild( row );
		return c;
	}
	function decide( id, op ) {
		document.querySelectorAll( '[data-act="' + id + '"] button' ).forEach( function ( b ) {
			b.disabled = true;
		} );
		call( op, { id: id } ).then( function ( a ) {
			document.querySelectorAll( '[data-act="' + id + '"]' ).forEach( function ( n ) {
				n.replaceWith( actionCard( a ) );
			} );
		} ).catch( function ( e ) {
			add( el( 'div', 'podai-as-msg is-ai', t.err + ' (' + e.message + ')' ) );
		} ).then( refresh );
	}

	// ---- result cards ----
	function list( items, render ) {
		var ul = el( 'ul', 'podai-as-list' );
		items.forEach( function ( x ) {
			ul.appendChild( render( x ) );
		} );
		var card = el( 'div', 'podai-as-card' );
		card.appendChild( ul );
		return add( card );
	}
	function teach( q ) {
		input.value = 'answer "' + q + '" with ""';
		input.focus();
		input.setSelectionRange( input.value.length - 1, input.value.length - 1 );
		input.title = t.teachHint;
	}
	function result( r ) {
		var x = r.result || {};
		if ( 'unanswered' === r.tool && x.questions && x.questions.length ) {
			list( x.questions, function ( q ) {
				var li = el( 'li' );
				li.appendChild( el( 'span', 'podai-as-q', q.text ) );
				li.appendChild( btn( t.teach, 'button-small', function () {
					teach( q.text );
				} ) );
				return li;
			} );
		} else if ( 'open_tickets' === r.tool && x.tickets && x.tickets.length ) {
			list( x.tickets, function ( k ) {
				var li = el( 'li' );
				li.appendChild( el( 'span', 'podai-as-badge ' + ( k.late ? 'is-failed' : 'is-proposed' ), k.waiting_h + ' h' ) );
				li.appendChild( el( 'span', 'podai-as-q', ( k.ticket_id || k.id ) + ' · ' + ( k.email || '–' ) + ' · ' + k.reason ) );
				li.appendChild( btn( t.show, 'button-small', function () {
					ask( 'show ' + ( k.ticket_id || k.id ) );
				} ) );
				return li;
			} );
		} else if ( 'ticket_detail' === r.tool ) {
			var k = x.ticket, d = x.draft, card = el( 'div', 'podai-as-card' );
			card.appendChild( el( 'strong', '', ( k.ticket_id || k.id ) + ' · ' + ( k.email || '–' ) ) );
			( k.messages || [] ).slice( -4 ).forEach( function ( m ) {
				var p = el( 'p', 'podai-as-line' );
				p.appendChild( el( 'b', '', ( 'user' === m.role ? t.customer : t.ai ) + ' ' ) );
				p.appendChild( document.createTextNode( m.text ) );
				card.appendChild( p );
			} );
			var pre = card.appendChild( el( 'pre', 'podai-as-pre', d.body ) );
			var row = card.appendChild( el( 'div', 'podai-as-btns' ) );
			row.appendChild( btn( t.copy, 'button-small', function () {
				if ( navigator.clipboard ) {
					navigator.clipboard.writeText( pre.textContent );
				}
			} ) );
			if ( d.to ) {
				var a = el( 'a', 'button button-small', t.mail );
				a.href = 'mailto:' + encodeURIComponent( d.to ) + '?subject=' + encodeURIComponent( d.subject ) + '&body=' + encodeURIComponent( d.body );
				row.appendChild( a );
			}
			add( card );
		} else if ( 'knowledge_list' === r.tool && x.entries && x.entries.length ) {
			list( x.entries, function ( e ) {
				var li = el( 'li' );
				li.appendChild( el( 'span', 'podai-as-q', e.question + ' — ' + e.answer ) );
				return li;
			} );
		} else if ( 'search_chats' === r.tool && x.matches && x.matches.length ) {
			list( x.matches, function ( m ) {
				var li = el( 'li' );
				li.appendChild( el( 'span', 'description', time( m.at ) ) );
				li.appendChild( el( 'span', 'podai-as-q', m.text ) );
				return li;
			} );
		} else if ( 'top_topics' === r.tool && x.topics && x.topics.length ) {
			list( x.topics, function ( i ) {
				var li = el( 'li' );
				li.appendChild( el( 'span', 'podai-as-q', i.id.replace( /_/g, ' ' ) ) );
				li.appendChild( el( 'b', '', i.n ) );
				return li;
			} );
		}
	}

	// ---- ask ----
	function ask( m ) {
		m = String( m || '' ).trim();
		if ( ! m ) {
			return;
		}
		add( el( 'div', 'podai-as-msg is-user', m ) );
		var wait = add( el( 'div', 'podai-as-msg is-ai is-wait', '…' ) );
		call( 'ask', { message: m } ).then( function ( r ) {
			wait.remove();
			var mode = document.getElementById( 'podai-as-mode' );
			mode.textContent = 'llm' === r.planner ? t.llm : t.rules;
			mode.hidden = false;
			add( el( 'div', 'podai-as-msg is-ai', r.reply ) );
			( r.results || [] ).forEach( result );
			( r.proposals || [] ).forEach( function ( a ) {
				add( actionCard( a ) );
			} );
			if ( r.suggestions && r.suggestions.length ) {
				var chips = el( 'div', 'podai-as-chips' );
				r.suggestions.forEach( function ( s ) {
					chips.appendChild( btn( s.label, 'button-small', function () {
						if ( 'teach' === s.kind ) {
							teach( s.question || '' );
						} else {
							ask( s.command );
						}
					} ) );
				} );
				add( chips );
			}
			refresh();
		} ).catch( function ( e ) {
			wait.remove();
			add( el( 'div', 'podai-as-msg is-ai', t.err + ' (' + e.message + ')' ) );
		} );
	}

	// ---- side panels ----
	function refresh() {
		call( 'actions' ).then( function ( rows ) {
			var q = document.getElementById( 'podai-as-queue' );
			q.textContent = '';
			document.getElementById( 'podai-as-n' ).textContent = rows.length;
			if ( ! rows.length ) {
				q.appendChild( el( 'p', 'description', t.none ) );
			}
			rows.forEach( function ( a ) {
				q.appendChild( actionCard( a ) );
			} );
		} ).catch( function () {} );
		call( 'audit' ).then( function ( rows ) {
			var ul = document.getElementById( 'podai-as-audit' );
			ul.textContent = '';
			rows.forEach( function ( x ) {
				var li = el( 'li' );
				li.appendChild( el( 'span', 'description', time( x.at ) ) );
				var what = ( t.events[ x.event ] || x.event ) + ( x.tool ? ' · ' + ( t.tools[ x.tool ] || x.tool ) : '' );
				if ( 'ask' === x.event && x.detail ) {
					what += ' · ' + String( x.detail ).replace( /^\w+: /, '' ).replace( /_/g, ' ' ).replace( /,/g, ', ' );
				}
				li.appendChild( el( 'span', 'podai-as-q', what ) );
				li.appendChild( el( 'span', 'description', String( x.actor || '' ).replace( /^woo_admin:?/, '' ) ) );
				ul.appendChild( li );
			} );
		} ).catch( function () {} );
	}

	var quick = document.getElementById( 'podai-as-quick' );
	[ 'q1', 'q2', 'q3', 'q4', 'q5' ].forEach( function ( k ) {
		quick.appendChild( btn( t[ k ], 'button-small', function () {
			ask( t[ k ] );
		} ) );
	} );
	document.getElementById( 'podai-as-form' ).addEventListener( 'submit', function ( e ) {
		e.preventDefault();
		var v = input.value;
		input.value = '';
		ask( v );
	} );
	ask( t.q1 );
}() );
