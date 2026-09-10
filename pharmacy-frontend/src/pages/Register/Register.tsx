import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { authApi } from "../../services/api";
import "./Register.css";

function Register() {
  const navigate = useNavigate();

  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [cin, setCin] = useState("");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [gender, setGender] = useState<"M" | "F">("M");

  const [pharmacyName, setPharmacyName] = useState("");
  const [licenseNumber, setLicenseNumber] = useState("");
  const [city, setCity] = useState("");
  const [address, setAddress] = useState("");

  const [latitude, setLatitude] = useState("");
  const [longitude, setLongitude] = useState("");

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [acceptedTerms, setAcceptedTerms] = useState(false);

  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);

  // =========================================================
  // REGISTER
  // =========================================================

  const handleRegister = async (
    event: React.FormEvent<HTMLFormElement>
  ) => {
    event.preventDefault();

    setError("");
    setSuccess("");

    // -------------------------------------------------------
    // Validate password
    // -------------------------------------------------------

    if (password.length < 8) {
      setError(
        "Le mot de passe doit contenir au moins 8 caractères."
      );
      return;
    }

    if (password !== confirmPassword) {
      setError(
        "Les mots de passe ne correspondent pas."
      );
      return;
    }

    // -------------------------------------------------------
    // Validate terms
    // -------------------------------------------------------

    if (!acceptedTerms) {
      setError(
        "Veuillez accepter les conditions d'utilisation."
      );
      return;
    }

    // -------------------------------------------------------
    // Validate coordinates
    // -------------------------------------------------------

    if (!latitude || !longitude) {
      setError(
        "Veuillez renseigner la position géographique de votre officine."
      );
      return;
    }

    setLoading(true);

    try {
      // -----------------------------------------------------
      // Send registration request
      // -----------------------------------------------------

      await authApi.register({
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        email: email.trim(),
        phone: phone.trim(),
        cin: cin.trim(),
        dateOfBirth,
        gender,

        pharmacyName: pharmacyName.trim(),
        licenseNumber: licenseNumber.trim(),
        city: city.trim(),
        address: address.trim(),

        latitude: Number(latitude),
        longitude: Number(longitude),

        password,
      });

      console.log("Registration successful");

      // -----------------------------------------------------
      // IMPORTANT:
      //
      // DO NOT store the response in localStorage.
      // DO NOT navigate to /dashboard.
      //
      // The pharmacy is not verified yet.
      // -----------------------------------------------------

      localStorage.removeItem("pharmacyUser");

      setSuccess(
        "Votre compte a été créé, en attente de vérification."
      );

      // Clear form
      setFirstName("");
      setLastName("");
      setEmail("");
      setPhone("");
      setCin("");
      setDateOfBirth("");
      setGender("M");

      setPharmacyName("");
      setLicenseNumber("");
      setCity("");
      setAddress("");

      setLatitude("");
      setLongitude("");

      setPassword("");
      setConfirmPassword("");
      setAcceptedTerms(false);

    } catch (error) {
      console.error("Registration error:", error);

      setError(
        error instanceof Error
          ? error.message
          : "Une erreur est survenue lors de la création du compte."
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="register-page">

      {/* =====================================================
          LEFT SIDE
          ===================================================== */}

      <section className="register-presentation">

        <div className="register-presentation-content">

          <div className="register-brand">
            <div className="register-brand-icon">
              ✚
            </div>

            <span>PharmaAI</span>
          </div>

          <div className="register-presentation-text">

            <span className="register-eyebrow">
              ESPACE PROFESSIONNEL
            </span>

            <h1>
              Rejoignez
              <br />
              l'écosystème PharmaAI.
            </h1>

            <p>
              Gérez votre officine avec une plateforme conçue
              pour simplifier vos opérations, améliorer votre
              visibilité et vous faire gagner du temps au quotidien.
            </p>

            <div className="register-features">

              <div className="register-feature">
                <span>✓</span>

                <div>
                  <strong>
                    Gestion intelligente
                  </strong>

                  <p>
                    Suivez vos commandes et votre stock en temps réel.
                  </p>
                </div>
              </div>


              <div className="register-feature">
                <span>✓</span>

                <div>
                  <strong>
                    Un espace sécurisé
                  </strong>

                  <p>
                    Vos données professionnelles restent protégées.
                  </p>
                </div>
              </div>


              <div className="register-feature">
                <span>✓</span>

                <div>
                  <strong>
                    Une meilleure organisation
                  </strong>

                  <p>
                    Centralisez les opérations de votre officine.
                  </p>
                </div>
              </div>

            </div>

          </div>


          <div className="register-dots">
            <span></span>
            <span className="active"></span>
            <span></span>
          </div>

        </div>

      </section>


      {/* =====================================================
          RIGHT SIDE
          ===================================================== */}

      <section className="register-form-section">

        <div className="register-card">

          <div className="register-header">

            <h2>
              Créer votre compte
            </h2>

            <p>
              Complétez les informations de votre profil professionnel.
            </p>

          </div>


          {/* =================================================
              SUCCESS MESSAGE
              ================================================= */}

          {success && (
            <div className="register-success">
              ✓ {success}

              <button
                type="button"
                onClick={() => navigate("/")}
              >
                Retourner à la connexion
              </button>
            </div>
          )}


          {/* =================================================
              ERROR MESSAGE
              ================================================= */}

          {error && (
            <div className="register-error">
              {error}
            </div>
          )}


          <form
            className="register-form"
            onSubmit={handleRegister}
          >

            {/* =================================================
                PERSONAL INFORMATION
                ================================================= */}

            <div className="register-section-title">
              Informations personnelles
            </div>


            <div className="register-two-columns">

              <div className="register-field">

                <label>
                  Prénom
                </label>

                <input
                  type="text"
                  placeholder="Votre prénom"
                  value={firstName}
                  onChange={(e) =>
                    setFirstName(e.target.value)
                  }
                  required
                />

              </div>


              <div className="register-field">

                <label>
                  Nom
                </label>

                <input
                  type="text"
                  placeholder="Votre nom"
                  value={lastName}
                  onChange={(e) =>
                    setLastName(e.target.value)
                  }
                  required
                />

              </div>

            </div>


            <div className="register-field">

              <label>
                Email professionnel
              </label>

              <div className="register-input-wrapper">

                <span>✉</span>

                <input
                  type="email"
                  placeholder="prenom.nom@pharmacie.fr"
                  value={email}
                  onChange={(e) =>
                    setEmail(e.target.value)
                  }
                  required
                />

              </div>

            </div>


            <div className="register-field">

              <label>
                Téléphone
              </label>

              <div className="register-input-wrapper">

                <span>☎</span>

                <input
                  type="tel"
                  placeholder="+212 6 XX XX XX XX"
                  value={phone}
                  onChange={(e) =>
                    setPhone(e.target.value)
                  }
                  required
                />

              </div>

            </div>


            <div className="register-two-columns">
              <div className="register-field">
                <label>CIN</label>
                <input
                  type="text"
                  placeholder="AB123456"
                  value={cin}
                  onChange={(e) => setCin(e.target.value.toUpperCase())}
                  required
                />
              </div>

              <div className="register-field">
                <label>Date de naissance</label>
                <input
                  type="date"
                  value={dateOfBirth}
                  onChange={(e) => setDateOfBirth(e.target.value)}
                  required
                />
              </div>
            </div>

            <div className="register-field">
              <label>Genre</label>
              <select
                value={gender}
                onChange={(e) => setGender(e.target.value as "M" | "F")}
                required
              >
                <option value="M">Homme</option>
                <option value="F">Femme</option>
              </select>
            </div>


            {/* =================================================
                PHARMACY INFORMATION
                ================================================= */}

            <div className="register-section-title pharmacy-title">
              Informations de l'officine
            </div>


            <div className="register-field">

              <label>
                Nom de l'officine
              </label>

              <div className="register-input-wrapper">

                <span>✚</span>

                <input
                  type="text"
                  placeholder="Nom de votre pharmacie"
                  value={pharmacyName}
                  onChange={(e) =>
                    setPharmacyName(e.target.value)
                  }
                  required
                />

              </div>

            </div>


            <div className="register-two-columns">

              <div className="register-field">

                <label>
                  Numéro de licence
                </label>

                <input
                  type="text"
                  placeholder="PH-XXXX-XXXX"
                  value={licenseNumber}
                  onChange={(e) =>
                    setLicenseNumber(e.target.value)
                  }
                  required
                />

              </div>


              <div className="register-field">

                <label>
                  Ville
                </label>

                <input
                  type="text"
                  placeholder="Casablanca"
                  value={city}
                  onChange={(e) =>
                    setCity(e.target.value)
                  }
                  required
                />

              </div>

            </div>


            <div className="register-field">

              <label>
                Adresse de l'officine
              </label>

              <div className="register-input-wrapper">

                <span>⌖</span>

                <input
                  type="text"
                  placeholder="Adresse complète"
                  value={address}
                  onChange={(e) =>
                    setAddress(e.target.value)
                  }
                  required
                />

              </div>

            </div>


            {/* =================================================
                LOCATION
                ================================================= */}

            <div className="register-section-title pharmacy-title">
              Localisation de l'officine
            </div>


            <div className="register-two-columns">

              <div className="register-field">

                <label>
                  Latitude
                </label>

                <input
                  type="number"
                  step="any"
                  placeholder="33.5731"
                  value={latitude}
                  onChange={(e) =>
                    setLatitude(e.target.value)
                  }
                  required
                />

              </div>


              <div className="register-field">

                <label>
                  Longitude
                </label>

                <input
                  type="number"
                  step="any"
                  placeholder="-7.5898"
                  value={longitude}
                  onChange={(e) =>
                    setLongitude(e.target.value)
                  }
                  required
                />

              </div>

            </div>


            {/* =================================================
                SECURITY
                ================================================= */}

            <div className="register-section-title pharmacy-title">
              Sécurité du compte
            </div>


            <div className="register-field">

              <label>
                Mot de passe
              </label>

              <div className="register-input-wrapper">

                <span>🔒</span>

                <input
                  type={
                    showPassword
                      ? "text"
                      : "password"
                  }
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) =>
                    setPassword(e.target.value)
                  }
                  required
                />

                <button
                  type="button"
                  className="register-password-toggle"
                  onClick={() =>
                    setShowPassword(!showPassword)
                  }
                >
                  {showPassword ? "◉" : "◌"}
                </button>

              </div>

            </div>


            <div className="register-field">

              <label>
                Confirmer le mot de passe
              </label>

              <div className="register-input-wrapper">

                <span>🔒</span>

                <input
                  type={
                    showConfirmPassword
                      ? "text"
                      : "password"
                  }
                  placeholder="••••••••"
                  value={confirmPassword}
                  onChange={(e) =>
                    setConfirmPassword(e.target.value)
                  }
                  required
                />

                <button
                  type="button"
                  className="register-password-toggle"
                  onClick={() =>
                    setShowConfirmPassword(
                      !showConfirmPassword
                    )
                  }
                >
                  {showConfirmPassword ? "◉" : "◌"}
                </button>

              </div>

            </div>


            {/* =================================================
                TERMS
                ================================================= */}

            <label className="register-terms">

              <input
                type="checkbox"
                checked={acceptedTerms}
                onChange={(e) =>
                  setAcceptedTerms(e.target.checked)
                }
              />

              <span>
                J'accepte les conditions d'utilisation
                et la politique de confidentialité de PharmaAI.
              </span>

            </label>


            {/* =================================================
                REGISTER BUTTON
                ================================================= */}

            <button
              type="submit"
              className="register-button"
              disabled={loading}
            >

              {loading
                ? "Création du compte..."
                : "Créer mon compte"
              }

              {!loading && (
                <span>→</span>
              )}

            </button>

          </form>


          {/* =================================================
              LOGIN
              ================================================= */}

          <div className="register-login">

            <span>
              Vous avez déjà un compte ?
            </span>

            <button
              type="button"
              onClick={() => navigate("/")}
              className="register-login-link"
            >
              Se connecter
            </button>

          </div>

        </div>

      </section>

    </div>
  );
}

export default Register;