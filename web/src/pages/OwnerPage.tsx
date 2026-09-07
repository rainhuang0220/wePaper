import { FormEvent, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { fetchOwnerSession, loginOwner, logoutOwner } from "../api";

export function OwnerPage() {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [owner, setOwner] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void fetchOwnerSession().then(setOwner);
  }, []);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await loginOwner(password);
      setOwner(true);
      navigate("/", { replace: true });
    } catch {
      setError("Could not sign in.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="lib">
      <header className="lib-bar">
        <Link className="mark" to="/">
          wePaper
        </Link>
      </header>
      <form className="owner-box" onSubmit={onSubmit}>
        <h1>Owner</h1>
        <p>Reading-status edits stay on this browser after you sign in. Public visitors can see labels but cannot change them.</p>
        {owner ? (
          <p>
            You are signed in.{" "}
            <button
              type="button"
              onClick={() => {
                void logoutOwner().then(() => setOwner(false));
              }}
            >
              Sign out
            </button>
          </p>
        ) : (
          <>
            <label>
              Password
              <input
                type="password"
                value={password}
                autoComplete="current-password"
                onChange={(event) => setPassword(event.target.value)}
              />
            </label>
            {error ? (
              <p className="note" role="alert">
                {error}
              </p>
            ) : null}
            <button type="submit" disabled={busy || !password}>
              Sign in
            </button>
          </>
        )}
      </form>
    </div>
  );
}
