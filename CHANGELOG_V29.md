# V29 — Account / Order / Admin Sync

- Fixes Review-complete `Request order` gating: the button is no longer blocked merely because the page was opened without server mode; server-only actions now show an explicit backend requirement.
- Adds customer registration, password login and email-code quick login with HttpOnly sessions.
- Homepage → Studio requires login; direct Studio server entry also requires login.
- Request order creates a tenant/user-linked Studio project, order, proof, order events and Admin task.
- Sends customer confirmation mail and optional operations mail through SendGrid/Postmark adapters.
- Adds account dashboard with order/proof/timeline/project/notification visibility.
- Admin Studio sync now shows customer accounts, projects, orders, proof states, order events, invitations and email notifications.
- Admin can attach/send a proof, change order lifecycle status, and resend status mail.
- Customer proof page supports Approve and Request changes; both sync order/proof state and notifications.
- Proof ready, proof approved, payment received and admin status changes trigger transactional email attempts.
- Adds user ownership checks for saved Studio projects/designs.
- Keeps durable runtime data persistable with `STORE_PERSIST_PATH`; PostgreSQL reference schema includes customer account/session/login-code/Studio/notification/invitation tables.
