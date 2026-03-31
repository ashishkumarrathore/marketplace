import { createSignal } from "solid-js";
import { postLogin, fetchProfile, fetchAccount } from "../api/client";
import {
  navigate,
  setSelectedProduct,
  showToast,
  saveUser,
  setWalletBalance,
} from "../store";

export default function LoginPage() {
  const [username, setUsername] = createSignal("");
  const [password, setPassword] = createSignal("");
  const [loading, setLoading] = createSignal(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const resp = await postLogin({
        username: username(),
        password: password(),
      });
      const token = resp.token;
      // persist token in sessionStorage for protected calls
      sessionStorage.setItem("userToken", token);
      // fetch user profile to populate wallet/accounts
      try {
        const profile = await fetchProfile();
        // profile.user + account
        saveUser(profile.user);
        sessionStorage.setItem("marketone_user", JSON.stringify(profile));
      } catch (err) {
        // ignore
      }
      // fetch account data (wallet balance, shipping, payment methods)
      try {
        const account = await fetchAccount();
        if (account) {
          sessionStorage.setItem("marketone_account", JSON.stringify(account));
          // Sync wallet balance from account response to navbar
          if (
            account.walletBalance !== undefined &&
            account.walletBalance !== null
          ) {
            setWalletBalance(account.walletBalance);
          }
        }
      } catch (err) {
        // ignore
      }
      showToast("✓ Logged in");
      navigate("catalog");
    } catch (err) {
      showToast("✕ Login failed: " + err.message, "error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div class="page-wrapper">
      <div class="page-header">
        <h1 class="page-title">Sign in</h1>
        <p class="page-subtitle">
          Enter any username/password to create or login.
        </p>
      </div>

      <div
        class="card card-padded"
        style={{ maxWidth: "540px", margin: "0 auto" }}
      >
        <form onSubmit={handleSubmit}>
          <div class="form-group">
            <label class="form-label">Email or Username</label>
            <input
              class="input-field"
              type="text"
              value={username()}
              onInput={(e) => setUsername(e.target.value)}
            />
          </div>
          <div class="form-group">
            <label class="form-label">Password</label>
            <input
              class="input-field"
              type="password"
              value={password()}
              onInput={(e) => setPassword(e.target.value)}
            />
          </div>
          <div style={{ height: "32px" }} />
          <div
            style={{
              display: "flex",
              gap: "12px",
              justifyContent: "flex-end",
            }}
          >
            <button class="btn btn-primary" type="submit">
              {loading() ? "Signing..." : "Sign in / Create account"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
