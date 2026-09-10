import { useState } from "react";
import { authApi } from "../../services/api";
import "./Login.css";
import { Link} from "react-router-dom";


function Login() {


const [email, setEmail] = useState("");
const [password, setPassword] = useState("");
const [showPassword, setShowPassword] = useState(false);
const [error, setError] = useState("");
const [loading, setLoading] = useState(false);

const handleLogin = async (
event: React.FormEvent<HTMLFormElement>
) => {
event.preventDefault();

setError("");
setLoading(true);

try {
  const response = await authApi.login({
    email,
    password,
  });

  console.log("Login successful:", response);

  localStorage.setItem(
  "pharmacyUser",
  JSON.stringify(response)
);

console.log("pharmacyUser saved:", response);

window.location.href = "/dashboard";

} catch (error) {
  console.error("Login error:", error);

  setError(
    "Email ou mot de passe incorrect."
  );
} finally {
  setLoading(false);
}


};

return ( <div className="login-page">

  {/* LEFT SIDE */}
  <section className="login-presentation">

    <div className="presentation-content">

      <div className="brand">
        <div className="brand-icon">✚</div>
        <span>PharmaAI</span>
      </div>

      <div className="presentation-text">
        <h1>
          L'intelligence opérationnelle
          <br />
          au service de votre officine.
        </h1>

        <p>
          Accédez à votre centre de commandement pour gérer les stocks
          en temps réel, optimiser les commandes et sécuriser la délivrance
          des ordonnances avec une précision médicale absolue.
        </p>
      </div>

      <div className="presentation-dots">
        <span></span>
        <span></span>
        <span className="active"></span>
      </div>

    </div>

  </section>


  {/* RIGHT SIDE */}
  <section className="login-form-section">

    <div className="login-card">

      <div className="login-header">
        <h2>Espace Pharmacien</h2>

        <p>
          Veuillez saisir vos identifiants pour continuer.
        </p>
      </div>


      <form
        className="login-form"
        onSubmit={handleLogin}
      >

        {/* EMAIL */}
        <div className="form-group">

          <label htmlFor="email">
            Email Professionnel
          </label>

          <div className="input-wrapper">

            <span className="input-icon">
              ✉
            </span>

            <input
              id="email"
              type="email"
              placeholder="prenom.nom@pharmacie.fr"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />

          </div>

        </div>


        {/* PASSWORD */}
        <div className="form-group">

          <div className="password-label">

            <label htmlFor="password">
              Mot de passe
            </label>

            <a href="#">
              Oublié ?
            </a>

          </div>


          <div className="input-wrapper">

            <span className="input-icon">
              🔒
            </span>

            <input
              id="password"
              type={showPassword ? "text" : "password"}
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />

            <button
              type="button"
              className="password-toggle"
              onClick={() =>
                setShowPassword(!showPassword)
              }
            >
              {showPassword ? "◉" : "◌"}
            </button>

          </div>

        </div>


        {/* ERROR MESSAGE */}
        {error && (
          <p className="login-error">
            {error}
          </p>
        )}


        {/* LOGIN BUTTON */}
        <button
          type="submit"
          className="login-button"
          disabled={loading}
        >
          {loading ? "Connexion..." : "Se connecter"}

          {!loading && (
            <span>→</span>
          )}
        </button>

      </form>


      {/* REGISTER */}
  <div className="register-section">

  <div className="separator">
    <span></span>
  </div>

  <p>
    Pas encore inscrit ?

    <Link to="/register">
      Créer un compte professionnel
    </Link>
  </p>

</div>

    </div>

  </section>

</div>


);
}

export default Login;
