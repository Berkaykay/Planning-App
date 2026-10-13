import React from 'react';
import Link from '../components/Link.jsx';
import { SCHEME } from '../lib/routes.js';

export default function NotFound({ path }) {
  return (
    <div className="empty-page">
      <h1>Page not found</h1>
      <p>
        There is no page at <code>{SCHEME + path}</code>.
      </p>
      <p>
        Try <code>cadence://dashboard</code>, <code>cadence://calendar</code>, <code>cadence://day/today</code> or{' '}
        <code>cadence://categories</code>.
      </p>
      <Link to="dashboard" className="button primary">
        Go to Dashboard
      </Link>
    </div>
  );
}
