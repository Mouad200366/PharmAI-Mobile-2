import { useEffect, useState } from "react";

import {
  pharmacyApi,
  userApi,
  changePassword,
} from "../../services/api";

import type {
  Pharmacy,
  User,
} from "../../services/api";

import "./Profile.css";

const storedUser = localStorage.getItem("pharmacyUser");

const pharmacyUser = storedUser
  ? JSON.parse(storedUser)
  : null;

const pharmacyId = pharmacyUser?.pharmacyId;
const userId = pharmacyUser?.userId;

function Profile() {
  // ======================================================
  // PROFILE STATE
  // ======================================================

  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const [pharmacy, setPharmacy] = useState<Pharmacy | null>(
    null
  );

  const [user, setUser] = useState<User | null>(
    null
  );

  const [profile, setProfile] = useState({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    pharmacyName: "",
    licenseNumber: "",
    address: "",
    city: "Casablanca",
  });

  // ======================================================
  // PASSWORD STATE
  // ======================================================

  const [
    currentPassword,
    setCurrentPassword,
  ] = useState("");

  const [
    newPassword,
    setNewPassword,
  ] = useState("");

  const [
    confirmPassword,
    setConfirmPassword,
  ] = useState("");

  const [
    showCurrentPassword,
    setShowCurrentPassword,
  ] = useState(false);

  const [
    showNewPassword,
    setShowNewPassword,
  ] = useState(false);

  const [
    showConfirmPassword,
    setShowConfirmPassword,
  ] = useState(false);

  const [
    passwordLoading,
    setPasswordLoading,
  ] = useState(false);

  const [
    passwordError,
    setPasswordError,
  ] = useState("");

  const [
    passwordSuccess,
    setPasswordSuccess,
  ] = useState("");

  // ======================================================
  // LOAD USER + PHARMACY
  // ======================================================

  useEffect(() => {
    fetchProfile();
  }, []);

  const fetchProfile = async () => {
    try {
      setLoading(true);
      setError("");

      if (!pharmacyId || !userId) {
        setError(
          "Session utilisateur introuvable."
        );

        return;
      }

      const [
        userData,
        pharmacyData,
      ] = await Promise.all([
        userApi.getUser(userId),
        pharmacyApi.getPharmacy(pharmacyId),
      ]);

      setUser(userData);
      setPharmacy(pharmacyData);

      setProfile({
        firstName: userData.firstName,
        lastName: userData.lastName,
        email: userData.email,
        phone: pharmacyData.phone,
        pharmacyName: pharmacyData.name,
        licenseNumber:
          pharmacyData.licenseNumber,
        address: pharmacyData.address,
        city: "Casablanca",
      });
    } catch (err) {
      console.error(
        "Profile error:",
        err
      );

      setError(
        "Impossible de récupérer les informations du profil."
      );
    } finally {
      setLoading(false);
    }
  };

  // ======================================================
  // HANDLE PROFILE INPUT
  // ======================================================

  const handleChange = (
    field: string,
    value: string
  ) => {
    setProfile((current) => ({
      ...current,
      [field]: value,
    }));
  };

  // ======================================================
  // SAVE USER + PHARMACY
  // ======================================================

  const handleSave = async () => {
    if (!pharmacyId || !userId) {
      setError(
        "Session utilisateur introuvable."
      );

      return;
    }

    try {
      setSaving(true);
      setError("");

      const updatedUser =
        await userApi.updateUser(
          userId,
          {
            firstName: profile.firstName,
            lastName: profile.lastName,
            email: profile.email,
          }
        );

      const updatedPharmacy =
        await pharmacyApi.updatePharmacy(
          pharmacyId,
          {
            name: profile.pharmacyName,
            licenseNumber:
              profile.licenseNumber,
            phone: profile.phone,
            address: profile.address,
          }
        );

      setUser(updatedUser);
      setPharmacy(updatedPharmacy);

      setProfile((current) => ({
        ...current,

        firstName:
          updatedUser.firstName,

        lastName:
          updatedUser.lastName,

        email:
          updatedUser.email,

        phone:
          updatedPharmacy.phone,

        pharmacyName:
          updatedPharmacy.name,

        licenseNumber:
          updatedPharmacy.licenseNumber,

        address:
          updatedPharmacy.address,
      }));

      setEditing(false);
    } catch (err) {
      console.error(
        "Profile save error:",
        err
      );

      setError(
        "Impossible d'enregistrer les modifications."
      );
    } finally {
      setSaving(false);
    }
  };

  // ======================================================
  // CANCEL PROFILE EDIT
  // ======================================================

  const handleCancel = () => {
    if (user && pharmacy) {
      setProfile({
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        phone: pharmacy.phone,
        pharmacyName: pharmacy.name,
        licenseNumber:
          pharmacy.licenseNumber,
        address: pharmacy.address,
        city: "Casablanca",
      });
    }

    setEditing(false);
    setError("");
  };

  // ======================================================
  // PASSWORD VALIDATION
  // ======================================================

  const validatePasswordForm = () => {
    if (!currentPassword) {
      return "Veuillez saisir votre mot de passe actuel.";
    }

    if (!newPassword) {
      return "Veuillez saisir un nouveau mot de passe.";
    }

    if (newPassword.length < 8) {
      return "Le nouveau mot de passe doit contenir au moins 8 caractères.";
    }

    if (
      newPassword === currentPassword
    ) {
      return "Le nouveau mot de passe doit être différent du mot de passe actuel.";
    }

    if (!confirmPassword) {
      return "Veuillez confirmer le nouveau mot de passe.";
    }

    if (
      newPassword !== confirmPassword
    ) {
      return "Les nouveaux mots de passe ne correspondent pas.";
    }

    return null;
  };

  // ======================================================
  // CHANGE PASSWORD
  // ======================================================

  const handleChangePassword = async (
    event: React.FormEvent<HTMLFormElement>
  ) => {
    event.preventDefault();

    setPasswordError("");
    setPasswordSuccess("");

    const validationError =
      validatePasswordForm();

    if (validationError) {
      setPasswordError(
        validationError
      );

      return;
    }

    try {
      setPasswordLoading(true);

      const response =
        await changePassword({
          currentPassword,
          newPassword,
          confirmPassword,
        });

      setPasswordSuccess(
        response?.message ||
          "Mot de passe modifié avec succès."
      );

      // Clear password fields after success
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");

      // Hide passwords again after success
      setShowCurrentPassword(false);
      setShowNewPassword(false);
      setShowConfirmPassword(false);
    } catch (err) {
      console.error(
        "Password change error:",
        err
      );

      setPasswordError(
        err instanceof Error
          ? err.message
          : "Impossible de modifier le mot de passe."
      );
    } finally {
      setPasswordLoading(false);
    }
  };

  // ======================================================
  // PASSWORD FIELD CHANGE HELPERS
  // ======================================================

  const clearPasswordMessages = () => {
    setPasswordError("");
    setPasswordSuccess("");
  };

  // ======================================================
  // AVATAR INITIAL
  // ======================================================

  const avatarLetter =
    profile.firstName
      .charAt(0)
      .toUpperCase() || "A";

  // ======================================================
  // RENDER
  // ======================================================

  return (
    <div className="profile-page">

      {/* ================= CONTENT ================= */}

      <main className="profile-content">

        {/* ================= HEADING ================= */}

        <div className="profile-heading">

          <div>

            <h1>
              Mon profil
            </h1>

            <p>
              Gérez vos informations personnelles et professionnelles.
            </p>

          </div>

          {!editing && (

            <button
              className="edit-profile-button"
              onClick={() =>
                setEditing(true)
              }
              disabled={loading}
            >
              ✎ Modifier le profil
            </button>

          )}

        </div>

        {/* ================= ERROR ================= */}

        {error && (

          <div
            style={{
              marginBottom: "20px",
              padding: "14px 18px",
              background: "#fff0f0",
              border:
                "1px solid #ffd5d5",
              borderRadius: "8px",
              color: "#c52f2f",
              fontSize: "12px",
              display: "flex",
              justifyContent:
                "space-between",
              alignItems: "center",
              gap: "15px",
            }}
          >

            <span>
              {error}
            </span>

            <button
              onClick={fetchProfile}
              style={{
                border: "none",
                background: "#c52f2f",
                color: "white",
                padding: "7px 12px",
                borderRadius: "5px",
                cursor: "pointer",
                fontSize: "11px",
              }}
            >
              Réessayer
            </button>

          </div>

        )}

        {/* ================= PROFILE HEADER ================= */}

        <section className="profile-header-card">

          <div className="large-avatar">
            {avatarLetter}
          </div>

          <div className="profile-main-info">

            <h2>
              {profile.firstName}{" "}
              {profile.lastName}
            </h2>

            <p>
              Pharmacien titulaire
            </p>

            {pharmacy?.verified && (

              <span className="verified-profile">
                ✓ Profil vérifié
              </span>

            )}

          </div>

        </section>

        {/* ================= PERSONAL INFORMATION ================= */}

        <section className="profile-card">

          <div className="profile-card-header">

            <div>

              <h2>
                Informations personnelles
              </h2>

              <p>
                Vos informations de contact.
              </p>

            </div>

          </div>

          <div className="profile-form-grid">

            {/* FIRST NAME */}

            <div className="profile-field">

              <label>
                Prénom
              </label>

              <input
                type="text"
                value={
                  profile.firstName
                }
                disabled={
                  !editing || saving
                }
                onChange={(e) =>
                  handleChange(
                    "firstName",
                    e.target.value
                  )
                }
              />

            </div>

            {/* LAST NAME */}

            <div className="profile-field">

              <label>
                Nom
              </label>

              <input
                type="text"
                value={
                  profile.lastName
                }
                disabled={
                  !editing || saving
                }
                onChange={(e) =>
                  handleChange(
                    "lastName",
                    e.target.value
                  )
                }
              />

            </div>

            {/* EMAIL */}

            <div className="profile-field">

              <label>
                Email professionnel
              </label>

              <input
                type="email"
                value={
                  profile.email
                }
                disabled={
                  !editing || saving
                }
                onChange={(e) =>
                  handleChange(
                    "email",
                    e.target.value
                  )
                }
              />

            </div>

            {/* PHONE */}

            <div className="profile-field">

              <label>
                Téléphone
              </label>

              <input
                type="text"
                value={
                  loading
                    ? "Chargement..."
                    : profile.phone
                }
                disabled={
                  !editing || saving
                }
                onChange={(e) =>
                  handleChange(
                    "phone",
                    e.target.value
                  )
                }
              />

            </div>

          </div>

        </section>

        {/* ================= PHARMACY INFORMATION ================= */}

        <section className="profile-card">

          <div className="profile-card-header">

            <div>

              <h2>
                Informations de l'officine
              </h2>

              <p>
                Informations professionnelles de votre pharmacie.
              </p>

            </div>

            {pharmacy?.verified && (

              <span className="verified-badge">
                ✓ Vérifiée
              </span>

            )}

          </div>

          <div className="profile-form-grid">

            {/* PHARMACY NAME */}

            <div className="profile-field full-field">

              <label>
                Nom de l'officine
              </label>

              <input
                type="text"
                value={
                  loading
                    ? "Chargement..."
                    : profile.pharmacyName
                }
                disabled={
                  !editing || saving
                }
                onChange={(e) =>
                  handleChange(
                    "pharmacyName",
                    e.target.value
                  )
                }
              />

            </div>

            {/* LICENSE */}

            <div className="profile-field">

              <label>
                Numéro de licence
              </label>

              <input
                type="text"
                value={
                  loading
                    ? "Chargement..."
                    : profile.licenseNumber
                }
                disabled={
                  !editing || saving
                }
                onChange={(e) =>
                  handleChange(
                    "licenseNumber",
                    e.target.value
                  )
                }
              />

            </div>

            {/* CITY */}

            <div className="profile-field">

              <label>
                Ville
              </label>

              <input
                type="text"
                value={profile.city}
                disabled={
                  !editing || saving
                }
                onChange={(e) =>
                  handleChange(
                    "city",
                    e.target.value
                  )
                }
              />

            </div>

            {/* ADDRESS */}

            <div className="profile-field full-field">

              <label>
                Adresse
              </label>

              <input
                type="text"
                value={
                  loading
                    ? "Chargement..."
                    : profile.address
                }
                disabled={
                  !editing || saving
                }
                onChange={(e) =>
                  handleChange(
                    "address",
                    e.target.value
                  )
                }
              />

            </div>

          </div>

        </section>

        {/* ================= STATUS ================= */}

        {pharmacy && (

          <section className="profile-card">

            <div className="profile-card-header">

              <div>

                <h2>
                  État de l'officine
                </h2>

                <p>
                  État actuel de votre pharmacie sur PharmaAI.
                </p>

              </div>

            </div>

            <div className="security-row">

              <div className="security-icon">
                {pharmacy.active
                  ? "✓"
                  : "!"}
              </div>

              <div className="security-info">

                <strong>
                  {pharmacy.active
                    ? "Officine active"
                    : "Officine inactive"}
                </strong>

                <span>
                  {pharmacy.verified
                    ? "Votre officine est vérifiée par PharmaAI."
                    : "Votre officine est en attente de vérification."}
                </span>

              </div>

            </div>

          </section>

        )}

        {/* ================= SECURITY ================= */}

<section className="profile-card">

  <div className="profile-card-header">

    <div>
      <h2>
        Sécurité
      </h2>

      <p>
        Gérez le mot de passe et la sécurité de votre compte.
      </p>
    </div>

  </div>

  <div className="profile-security-content">

    {/* SECURITY INTRO */}

    <div className="profile-security-summary">

      <div className="profile-security-icon">
        🔒
      </div>

      <div>
        <strong>
          Modifier le mot de passe
        </strong>

        <p>
          Choisissez un mot de passe différent de l'actuel
          et contenant au moins 8 caractères.
        </p>
      </div>

    </div>

    {/* PASSWORD FORM */}

    <form
      className="profile-password-form"
      onSubmit={handleChangePassword}
    >

      <div className="profile-password-grid">

        {/* CURRENT PASSWORD */}

        <div className="profile-field full-field">

          <label htmlFor="currentPassword">
            Mot de passe actuel
          </label>

          <div className="profile-password-input">

            <input
              id="currentPassword"
              type={
                showCurrentPassword
                  ? "text"
                  : "password"
              }
              value={currentPassword}
              disabled={passwordLoading}
              autoComplete="current-password"
              placeholder="Saisissez votre mot de passe actuel"
              onChange={(e) => {
                setCurrentPassword(
                  e.target.value
                );

                clearPasswordMessages();
              }}
            />

            <button
              type="button"
              className="profile-password-toggle"
              disabled={passwordLoading}
              onClick={() =>
                setShowCurrentPassword(
                  (current) => !current
                )
              }
            >
              {showCurrentPassword
                ? "Masquer"
                : "Afficher"}
            </button>

          </div>

        </div>

        {/* NEW PASSWORD */}

        <div className="profile-field">

          <label htmlFor="newPassword">
            Nouveau mot de passe
          </label>

          <div className="profile-password-input">

            <input
              id="newPassword"
              type={
                showNewPassword
                  ? "text"
                  : "password"
              }
              value={newPassword}
              disabled={passwordLoading}
              autoComplete="new-password"
              placeholder="Minimum 8 caractères"
              onChange={(e) => {
                setNewPassword(
                  e.target.value
                );

                clearPasswordMessages();
              }}
            />

            <button
              type="button"
              className="profile-password-toggle"
              disabled={passwordLoading}
              onClick={() =>
                setShowNewPassword(
                  (current) => !current
                )
              }
            >
              {showNewPassword
                ? "Masquer"
                : "Afficher"}
            </button>

          </div>

        </div>

        {/* CONFIRM PASSWORD */}

        <div className="profile-field">

          <label htmlFor="confirmPassword">
            Confirmer le nouveau mot de passe
          </label>

          <div className="profile-password-input">

            <input
              id="confirmPassword"
              type={
                showConfirmPassword
                  ? "text"
                  : "password"
              }
              value={confirmPassword}
              disabled={passwordLoading}
              autoComplete="new-password"
              placeholder="Confirmez le nouveau mot de passe"
              onChange={(e) => {
                setConfirmPassword(
                  e.target.value
                );

                clearPasswordMessages();
              }}
            />

            <button
              type="button"
              className="profile-password-toggle"
              disabled={passwordLoading}
              onClick={() =>
                setShowConfirmPassword(
                  (current) => !current
                )
              }
            >
              {showConfirmPassword
                ? "Masquer"
                : "Afficher"}
            </button>

          </div>

        </div>

      </div>

      {/* HELP */}

      <div className="profile-password-help">
        Le mot de passe doit contenir au moins 8 caractères.
      </div>

      {/* ERROR */}

      {passwordError && (

        <div className="profile-password-message profile-password-error">

          <span className="profile-password-message-icon">
            !
          </span>

          <span>
            {passwordError}
          </span>

        </div>

      )}

      {/* SUCCESS */}

      {passwordSuccess && (

        <div className="profile-password-message profile-password-success">

          <span className="profile-password-message-icon">
            ✓
          </span>

          <span>
            {passwordSuccess}
          </span>

        </div>

      )}

      {/* ACTION */}

      <div className="profile-password-actions">

        <button
          type="submit"
          className="save-button"
          disabled={passwordLoading}
        >
          {passwordLoading
            ? "Modification..."
            : "Modifier le mot de passe"}
        </button>

      </div>

    </form>

  </div>

</section>

        {/* ================= SAVE ACTIONS ================= */}

        {editing && (

          <div className="profile-save-actions">

            <button
              className="cancel-button"
              onClick={handleCancel}
              disabled={saving}
            >
              Annuler
            </button>

            <button
              className="save-button"
              onClick={handleSave}
              disabled={saving}
            >
              {saving
                ? "Enregistrement..."
                : "✓ Enregistrer les modifications"}
            </button>

          </div>

        )}

        {/* ================= REFRESH ================= */}

        <div
          style={{
            marginTop: "18px",
            display: "flex",
            justifyContent:
              "flex-end",
          }}
        >

          <button
            onClick={fetchProfile}
            disabled={
              loading || saving
            }
            style={{
              border:
                "1px solid #dbe3f0",
              background: "white",
              color: "#123f91",
              padding: "8px 14px",
              borderRadius: "6px",
              fontSize: "10px",
              fontWeight: 600,
              cursor:
                loading || saving
                  ? "default"
                  : "pointer",
              opacity:
                loading || saving
                  ? 0.6
                  : 1,
            }}
          >
            ↻ Actualiser le profil
          </button>

        </div>

      </main>

    </div>
  );
}

export default Profile;