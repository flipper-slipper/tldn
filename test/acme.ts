// The acme-shop model as the operations an agent would send to update_model, plus the
// "voice search" proposal from the Figma flows. Used by the tests and by scripts/seed-acme.ts.
const ref = (file: string, symbol?: string) => (symbol ? { file, symbol } : { file });

export const ACME_OPS = [
  { op: 'set_system', name: 'acme-shop', description: 'Online store where shoppers browse, order and pay.' },
  { op: 'add_person', id: 'shopper', name: 'Shopper', description: 'Buys products online.' },
  { op: 'add_external', id: 'stripe', name: 'Stripe', description: 'Takes card payments and refunds.', technology: 'Stripe API' },
  { op: 'add_external', id: 'sendgrid', name: 'SendGrid', description: 'Delivers transactional email.', technology: 'SendGrid API' },
  { op: 'add_container', id: 'web', name: 'Web App', type: 'web-app', technology: 'React', path: 'web', description: 'Storefront where shoppers sign in, fill a cart and check out.' },
  { op: 'add_container', id: 'api', name: 'API Service', type: 'api', technology: 'Node.js · Express', path: 'api', description: 'Handles sign-in, orders and payments for the storefront.' },
  { op: 'add_container', id: 'db', name: 'Database', type: 'database', technology: 'Postgres', path: 'db', description: 'Stores users, products and orders.' },
  { op: 'add_component', container: 'web', id: 'sign-in', name: 'Sign-in', technology: 'React', description: 'Lets a shopper sign in before shopping.', code: [ref('web/App.tsx', 'LoginForm'), ref('web/App.tsx', 'App')] },
  { op: 'add_component', container: 'web', id: 'cart-checkout', name: 'Cart & checkout', technology: 'React', description: 'Shows what is in the cart and places the order.', code: [ref('web/Cart.tsx', 'Cart')] },
  { op: 'add_component', container: 'api', id: 'login-sessions', name: 'Login & sessions', description: 'Checks passwords, keeps sessions and sends password-reset links.', code: [ref('api/auth.ts', 'AuthController')] },
  { op: 'add_component', container: 'api', id: 'orders', name: 'Orders', description: 'Turns a cart into a paid order and cancels orders with a refund.', code: [ref('api/orders.ts', 'OrderService'), ref('api/index.ts')] },
  { op: 'add_component', container: 'api', id: 'accounts', name: 'User accounts', description: 'Finds and saves shopper accounts.', code: [ref('api/users.ts', 'UserRepository'), ref('api/db.ts', 'db')] },
  { op: 'add_component', container: 'api', id: 'payments', name: 'Payments', description: 'Charges and refunds cards through Stripe.', code: [ref('api/payments.ts', 'PaymentClient')] },
  { op: 'add_component', container: 'api', id: 'email', name: 'Email sending', description: 'Sends account emails such as password resets.', code: [ref('api/lib/mail.ts', 'sendEmail')] },
  { op: 'add_relationship', from: 'shopper', to: 'sign-in', kind: 'uses', description: 'signs in' },
  { op: 'add_relationship', from: 'shopper', to: 'cart-checkout', kind: 'uses', description: 'checks out' },
  { op: 'add_relationship', from: 'sign-in', to: 'login-sessions', kind: 'request', description: 'logs in', technology: 'HTTPS/JSON', evidence: [ref('web/App.tsx', 'LoginForm')] },
  { op: 'add_relationship', from: 'cart-checkout', to: 'orders', kind: 'request', description: 'places order', technology: 'HTTPS/JSON', evidence: [ref('web/Cart.tsx', 'checkout')] },
  { op: 'add_relationship', from: 'login-sessions', to: 'accounts', kind: 'internal', description: 'looks up users' },
  { op: 'add_relationship', from: 'login-sessions', to: 'email', kind: 'internal', description: 'sends reset link' },
  { op: 'add_relationship', from: 'orders', to: 'payments', kind: 'internal', description: 'charges and refunds' },
  { op: 'add_relationship', from: 'accounts', to: 'db', kind: 'data', description: 'reads and writes users', technology: 'SQL' },
  { op: 'add_relationship', from: 'orders', to: 'db', kind: 'data', description: 'saves orders', technology: 'SQL' },
  { op: 'add_relationship', from: 'payments', to: 'stripe', kind: 'external', description: 'charges cards', technology: 'HTTPS' },
  { op: 'add_relationship', from: 'email', to: 'sendgrid', kind: 'external', description: 'sends email', technology: 'HTTPS' },
];

export const VOICE_SEARCH = {
  summary: 'Add voice search so shoppers can search by speaking',
  ops: [
    { op: 'add_external', id: 'speech', name: 'Speech-to-text', description: 'Turns spoken audio into text.', technology: 'Speech API' },
    { op: 'add_component', container: 'web', id: 'voice-search', name: 'Voice search', description: 'Mic button that records a query and shows a live transcript.', code: [ref('web/VoiceSearch.tsx', 'VoiceSearch')] },
    { op: 'add_component', container: 'api', id: 'search', name: 'Product search', description: 'Finds products for a typed or spoken query.', code: [ref('api/search.ts', 'search')] },
    { op: 'add_relationship', from: 'shopper', to: 'voice-search', kind: 'uses', description: 'searches by speaking' },
    { op: 'add_relationship', from: 'voice-search', to: 'search', kind: 'request', description: 'spoken query', technology: 'HTTPS/JSON' },
    { op: 'add_relationship', from: 'search', to: 'speech', kind: 'external', description: 'transcribes audio', technology: 'HTTPS' },
    { op: 'add_relationship', from: 'search', to: 'db', kind: 'data', description: 'finds products', technology: 'SQL' },
  ],
};
