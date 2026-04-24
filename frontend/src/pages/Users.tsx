import { useEffect, useState } from "react";
import {
  DemoUser,
  listDemoUsers,
  restoreDemoUsers,
} from "../services/api";

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function Users() {
  const [users, setUsers] = useState<DemoUser[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRestoring, setIsRestoring] = useState(false);
  const [message, setMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  async function loadUsers() {
    setIsLoading(true);
    setErrorMessage("");

    try {
      const data = await listDemoUsers();
      setUsers(data);
    } catch (error) {
      setErrorMessage("Unable to load demo users. Confirm the backend is running.");
    } finally {
      setIsLoading(false);
    }
  }

  async function handleRestore() {
    setIsRestoring(true);
    setMessage("");
    setErrorMessage("");

    try {
      const data = await restoreDemoUsers();
      setUsers(data);
      setMessage("Demo users restored. You can run deletion demos again.");
    } catch (error) {
      setErrorMessage("Unable to restore demo users.");
    } finally {
      setIsRestoring(false);
    }
  }

  useEffect(() => {
    loadUsers();
  }, []);

  return (
    <div className="page-grid">
      <section className="hero-panel">
        <div className="hero-spotlight">
          <div className="hero-copy">
            <span className="eyebrow">Primary data store</span>
            <h1>View demo users before and after deletion requests run.</h1>
            <p>
              This directory shows the sample user records in the primary data
              service. Delete a username from the submit page, then return here
              to confirm the record was removed.
            </p>
            <div className="hero-actions">
              <button className="button-primary" onClick={loadUsers}>
                Refresh users
              </button>
              <button
                className="button-secondary"
                onClick={handleRestore}
                disabled={isRestoring}
              >
                {isRestoring ? "Restoring..." : "Restore demo users"}
              </button>
            </div>
          </div>

          <aside className="hero-side-panel">
            <span className="hero-side-label">Current records</span>
            <div className="hero-side-value">
              {users.length} <span>users</span>
            </div>
            <p className="hero-side-copy">
              Use usernames like alice, bob, charlie, diana, or eve as subject
              IDs when submitting deletion requests.
            </p>
          </aside>
        </div>
      </section>

      {message ? (
        <div className="inline-message success" role="status">
          <strong>Ready for demo</strong>
          <span>{message}</span>
        </div>
      ) : null}

      {errorMessage ? (
        <div className="inline-message error" role="alert">
          <strong>User directory unavailable</strong>
          <span>{errorMessage}</span>
        </div>
      ) : null}

      <section className="content-panel user-directory">
        <div className="section-heading">
          <h2>Demo users</h2>
          <p>
            These rows represent the primary database records affected by
            deletion requests.
          </p>
        </div>

        {isLoading ? (
          <div className="empty-state">
            <div>
              <h3>Loading users</h3>
              <p>Fetching records from the primary data store.</p>
            </div>
          </div>
        ) : null}

        {!isLoading && users.length === 0 ? (
          <div className="empty-state">
            <div>
              <h3>No demo users found</h3>
              <p>Restore the demo users to run the deletion walkthrough again.</p>
            </div>
          </div>
        ) : null}

        {!isLoading && users.length > 0 ? (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Username</th>
                  <th>Email</th>
                  <th>User ID</th>
                  <th>Created</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr key={user.id}>
                    <td>
                      <strong>{user.username}</strong>
                    </td>
                    <td>{user.email}</td>
                    <td className="mono">{user.id}</td>
                    <td>{formatDate(user.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>
    </div>
  );
}

export default Users;
