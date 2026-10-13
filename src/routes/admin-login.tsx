import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { authClient } from "@/lib/auth-client";
import { getSignedInUser } from "@/lib/auth.server";

export const Route = createFileRoute("/admin-login")({ component: AdminLoginPage });

function AdminLoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setPending(true); setError("");
    try {
      const result = await authClient.signIn.username({ username: username.trim(), password });
      if (result.error) throw new Error(result.error.message || "Invalid admin username or password.");
      const user = await getSignedInUser();
      if (user?.role !== "admin") {
        await authClient.signOut();
        throw new Error("This account does not have administrator access.");
      }
      window.location.assign("/admin");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not sign in. Please try again.");
    } finally { setPending(false); }
  }

  return <main className="account-page"><div className="account-card">
    <Link to="/" className="account-back">YB SHOP</Link>
    <p className="account-eyebrow">SECURE ADMIN ACCESS</p>
    <h1>Admin sign in</h1>
    <p className="account-copy">Sign in with your administrator username and password to manage orders and customers.</p>
    <form onSubmit={submit} className="account-form">
      <label>Admin username<input required autoComplete="username" value={username} onChange={(event) => setUsername(event.target.value)} /></label>
      <label>Password<input required type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} /></label>
      {error && <p className="account-error" role="alert">{error}</p>}
      <button type="submit" disabled={pending}>{pending ? "PLEASE WAIT..." : "SIGN IN TO ADMIN"}</button>
    </form>
    <p className="account-switch">Use the admin username set in your dashboard account settings.</p>
  </div></main>;
}
