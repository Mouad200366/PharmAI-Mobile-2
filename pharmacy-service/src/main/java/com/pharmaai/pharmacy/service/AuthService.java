package com.pharmaai.pharmacy.service;

import java.time.LocalDate;
import java.time.LocalTime;
import java.time.OffsetDateTime;

import org.locationtech.jts.geom.Coordinate;
import org.locationtech.jts.geom.GeometryFactory;
import org.locationtech.jts.geom.Point;
import org.locationtech.jts.geom.PrecisionModel;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.security.authentication.DisabledException;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.AuthenticationException;
import org.springframework.security.core.context.SecurityContext;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.web.context.SecurityContextRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.pharmaai.pharmacy.dto.ChangePasswordRequest;
import com.pharmaai.pharmacy.dto.LoginRequest;
import com.pharmaai.pharmacy.dto.LoginResponse;
import com.pharmaai.pharmacy.dto.RegisterRequest;
import com.pharmaai.pharmacy.entity.Pharmacy;
import com.pharmaai.pharmacy.entity.User;
import com.pharmaai.pharmacy.repository.PharmacyRepository;
import com.pharmaai.pharmacy.repository.UserRepository;
import com.pharmaai.pharmacy.security.DjangoPasswordEncoder;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

@Service
public class AuthService {

    private final UserRepository userRepository;
    private final PharmacyRepository pharmacyRepository;

    
    private final DjangoPasswordEncoder passwordEncoder;


    // =========================================================
    // GEOGRAPHIC CONFIGURATION
    // =========================================================

    /*
     * EPSG:4326 = WGS84
     *
     * Used for latitude / longitude coordinates.
     */
    private static final int SRID = 4326;

    private final GeometryFactory geometryFactory =
            new GeometryFactory(
                    new PrecisionModel(),
                    SRID
            );
    private final AuthenticationManager authenticationManager;

    private final SecurityContextRepository securityContextRepository;


    // =========================================================
    // CONSTRUCTOR
    // =========================================================

    public AuthService(
            UserRepository userRepository,
            PharmacyRepository pharmacyRepository,
            DjangoPasswordEncoder passwordEncoder,
            AuthenticationManager authenticationManager,
            SecurityContextRepository securityContextRepository
    ) {
        this.userRepository = userRepository;
        this.pharmacyRepository = pharmacyRepository;
        this.passwordEncoder = passwordEncoder;
        this.authenticationManager = authenticationManager;
        this.securityContextRepository = securityContextRepository;
    }


    public LoginResponse login(
            LoginRequest request,
            HttpServletRequest httpRequest,
            HttpServletResponse httpResponse
    ) {

        // =========================================================
        // VALIDATION
        // =========================================================

        if (request == null ||
                request.getEmail() == null ||
                request.getEmail().isBlank() ||
                request.getPassword() == null ||
                request.getPassword().isBlank()) {

            throw new RuntimeException(
                    "Email et mot de passe obligatoires."
            );
        }

        // =========================================================
        // CLEAN EMAIL
        // =========================================================

        String email =
                request.getEmail()
                        .trim()
                        .toLowerCase();

        // =========================================================
        // FIND USER
        // =========================================================

        User user =
                userRepository
                        .findByEmail(email)
                        .orElseThrow(() ->
                                new RuntimeException(
                                        "Email ou mot de passe incorrect."
                                )
                        );

        // =========================================================
        // CHECK ROLE
        // =========================================================

        if (user.getRole() == null ||
                !"pharmacist".equalsIgnoreCase(
                        user.getRole()
                )) {

            throw new RuntimeException(
                    "Accès réservé aux pharmaciens."
            );
        }

        // =========================================================
        // AUTHENTICATE WITH SPRING SECURITY
        // =========================================================

        try {

            Authentication authentication =
                    authenticationManager.authenticate(
                            new UsernamePasswordAuthenticationToken(
                                    email,
                                    request.getPassword()
                            )
                    );

            if (authentication == null ||
                    !authentication.isAuthenticated()) {

                throw new RuntimeException(
                        "Email ou mot de passe incorrect."
                );
            }

            // =====================================================
            // CREATE SECURITY CONTEXT
            // =====================================================

            SecurityContext context =
                    SecurityContextHolder.createEmptyContext();

            context.setAuthentication(authentication);

            SecurityContextHolder.setContext(context);

            // =====================================================
            // SAVE SECURITY CONTEXT TO HTTP SESSION
            // =====================================================

            securityContextRepository.saveContext(
                    context,
                    httpRequest,
                    httpResponse
            );

        } catch (DisabledException e) {

            throw new RuntimeException(
                    "Ce compte est actuellement désactivé."
            );

        } catch (BadCredentialsException e) {

            throw new RuntimeException(
                    "Email ou mot de passe incorrect."
            );

        } catch (AuthenticationException e) {

            throw new RuntimeException(
                    "Email ou mot de passe incorrect."
            );
        }

        // =========================================================
        // FIND PHARMACY
        // =========================================================

        Pharmacy pharmacy =
                pharmacyRepository
                        .findByOwnerId(user.getId())
                        .orElseThrow(() ->
                                new RuntimeException(
                                        "Aucune pharmacie associée à ce compte."
                                )
                        );

        // =========================================================
        // CHECK PHARMACY STATUS
        // =========================================================

        if (!pharmacy.isActive()) {

            throw new RuntimeException(
                    "Cette pharmacie est actuellement inactive."
            );
        }

        if (!pharmacy.isVerified()) {

            throw new RuntimeException(
                    "Cette pharmacie n'est pas encore vérifiée."
            );
        }

        // =========================================================
        // UPDATE LAST LOGIN
        // =========================================================

        user.setLastLogin(
                OffsetDateTime.now()
        );

        userRepository.save(user);

        // =========================================================
        // RETURN LOGIN RESPONSE
        // =========================================================

        return new LoginResponse(
                user.getId(),
                pharmacy.getId(),
                user.getFirstName(),
                user.getLastName(),
                user.getEmail(),
                user.getRole()
        );
    }


    // =========================================================
    // REGISTER PHARMACIST
    // =========================================================

    @Transactional
    public LoginResponse register(
            RegisterRequest request
    ) {

        // -----------------------------------------------------
        // Validate request
        // -----------------------------------------------------

        if (request == null) {

            throw new RuntimeException(
                    "Les données d'inscription sont obligatoires."
            );
        }


        if (isBlank(request.getFirstName())) {

            throw new RuntimeException(
                    "Le prénom est obligatoire."
            );
        }


        if (isBlank(request.getLastName())) {

            throw new RuntimeException(
                    "Le nom est obligatoire."
            );
        }


        if (isBlank(request.getEmail())) {

            throw new RuntimeException(
                    "L'email est obligatoire."
            );
        }


        if (isBlank(request.getPassword())) {

            throw new RuntimeException(
                    "Le mot de passe est obligatoire."
            );
        }


        if (request.getPassword().length() < 8) {

            throw new RuntimeException(
                    "Le mot de passe doit contenir au moins 8 caractères."
            );
        }


        if (isBlank(request.getPharmacyName())) {

            throw new RuntimeException(
                    "Le nom de l'officine est obligatoire."
            );
        }


        if (isBlank(request.getLicenseNumber())) {

            throw new RuntimeException(
                    "Le numéro de licence est obligatoire."
            );
        }


        if (isBlank(request.getCity())) {

            throw new RuntimeException(
                    "La ville est obligatoire."
            );
        }


        if (isBlank(request.getAddress())) {

            throw new RuntimeException(
                    "L'adresse de l'officine est obligatoire."
            );
        }


        // -----------------------------------------------------
        // Validate coordinates
        // -----------------------------------------------------

        if (request.getLatitude() == null ||
                request.getLongitude() == null) {

            throw new RuntimeException(
                    "La latitude et la longitude de la pharmacie sont obligatoires."
            );
        }


        double latitude =
                request.getLatitude().doubleValue();

        double longitude =
                request.getLongitude().doubleValue();


        // -----------------------------------------------------
        // Validate coordinate ranges
        // -----------------------------------------------------

        if (latitude < -90 ||
                latitude > 90) {

            throw new RuntimeException(
                    "Latitude invalide."
            );
        }


        if (longitude < -180 ||
                longitude > 180) {

            throw new RuntimeException(
                    "Longitude invalide."
            );
        }


        // -----------------------------------------------------
        // Clean values
        // -----------------------------------------------------

        String firstName =
                request.getFirstName().trim();

        String lastName =
                request.getLastName().trim();

        String email =
                request.getEmail()
                        .trim()
                        .toLowerCase();

        String pharmacyName =
                request.getPharmacyName().trim();

        String licenseNumber =
                request.getLicenseNumber().trim();

        String city =
                request.getCity().trim();

        String address =
                request.getAddress().trim();


        // -----------------------------------------------------
        // Check email
        // -----------------------------------------------------

        if (userRepository
                .findByEmail(email)
                .isPresent()) {

            throw new RuntimeException(
                    "Un compte existe déjà avec cet email."
            );
        }


        // -----------------------------------------------------
        // Check pharmacy license
        // -----------------------------------------------------
        //
        // Kept compatible with your current implementation.
        //
        // This can be optimized later with a repository query.
        // -----------------------------------------------------

        if (pharmacyRepository
                .findAll()
                .stream()
                .anyMatch(pharmacy ->
                        pharmacy.getLicenseNumber() != null &&
                        pharmacy.getLicenseNumber()
                                .equalsIgnoreCase(
                                        licenseNumber
                                ))) {

            throw new RuntimeException(
                    "Cette licence de pharmacie est déjà utilisée."
            );
        }


        // =====================================================
        // CREATE USER
        // =====================================================

        User user =
                new User();


        user.setFirstName(
                firstName
        );


        user.setLastName(
                lastName
        );


        user.setEmail(
                email
        );


        // -----------------------------------------------------
        // Django-compatible password
        // -----------------------------------------------------
        //
        // The new DjangoPasswordEncoder creates:
        //
        // pbkdf2_sha256$iterations$salt$hash
        //
        // which is compatible with the Django database.
        // -----------------------------------------------------

        user.setPassword(
                passwordEncoder.encode(
                        request.getPassword()
                )
        );


        user.setRole(
                "pharmacist"
        );


        // -----------------------------------------------------
        // Django required fields
        // -----------------------------------------------------

        user.setSuperuser(
                false
        );

        user.setActive(
                true
        );

        user.setStaff(
                false
        );

        user.setPhoneVerified(
        false
);

        user.setDateJoined(
                OffsetDateTime.now()
        );


        // -----------------------------------------------------
        // Default date of birth / gender
        // -----------------------------------------------------

        user.setDateOfBirth(
                LocalDate.of(
                        2000,
                        1,
                        1
                )
        );


        user.setGender(
                "U"
        );



        // -----------------------------------------------------
        // Save user
        // -----------------------------------------------------

        User savedUser =
                userRepository.save(
                        user
                );


        // =====================================================
        // CREATE PHARMACY
        // =====================================================

        Pharmacy pharmacy =
                new Pharmacy();


        pharmacy.setName(
                pharmacyName
        );


        pharmacy.setLicenseNumber(
                licenseNumber
        );


        // -----------------------------------------------------
        // Pharmacy address
        // -----------------------------------------------------

        pharmacy.setAddress(
                address + ", " + city
        );


        // -----------------------------------------------------
        // Opening hours
        // -----------------------------------------------------

        pharmacy.setOpensAt(
                LocalTime.of(
                        8,
                        0
                )
        );


        pharmacy.setClosesAt(
                LocalTime.of(
                        20,
                        0
                )
        );


        // -----------------------------------------------------
        // Phone
        // -----------------------------------------------------

        if (!isBlank(request.getPhone())) {

            pharmacy.setPhone(
                    request.getPhone().trim()
            );

        } else {

            pharmacy.setPhone(
                    ""
            );
        }


        // -----------------------------------------------------
        // Dates
        // -----------------------------------------------------

        pharmacy.setCreatedAt(
                OffsetDateTime.now()
        );


        pharmacy.setUpdatedAt(
                OffsetDateTime.now()
        );


        // -----------------------------------------------------
        // Pharmacy status
        // -----------------------------------------------------

        pharmacy.setActive(
                true
        );


        /*
         * New pharmacies are not automatically verified.
         */

        pharmacy.setVerified(
                false
        );


        // -----------------------------------------------------
        // Link pharmacy to user
        // -----------------------------------------------------

        pharmacy.setOwnerId(
                savedUser.getId()
        );


        // =====================================================
        // PHARMACY GEOGRAPHIC LOCATION
        // =====================================================

        /*
         * PostGIS expects:
         *
         * POINT(longitude latitude)
         */

        Point pharmacyLocation =
                geometryFactory.createPoint(
                        new Coordinate(
                                longitude,
                                latitude
                        )
                );


        pharmacyLocation.setSRID(
                SRID
        );


        pharmacy.setLocation(
                pharmacyLocation
        );


        // -----------------------------------------------------
        // Save pharmacy
        // -----------------------------------------------------

        Pharmacy savedPharmacy =
                pharmacyRepository.save(
                        pharmacy
                );


        // =====================================================
        // RETURN REGISTRATION RESULT
        // =====================================================

        return new LoginResponse(
                savedUser.getId(),
                savedPharmacy.getId(),
                savedUser.getFirstName(),
                savedUser.getLastName(),
                savedUser.getEmail(),
                savedUser.getRole()
        );
    }
    
 // =========================================================
 // CURRENT AUTHENTICATED USER
 // =========================================================

 public LoginResponse getCurrentUser(
         Authentication authentication
 ) {

     // ---------------------------------------------------------
     // Check authentication
     // ---------------------------------------------------------

     if (authentication == null ||
             !authentication.isAuthenticated()) {

         throw new RuntimeException(
                 "Utilisateur non authentifié."
         );
     }

     // ---------------------------------------------------------
     // Get authenticated email
     // ---------------------------------------------------------

     String email = authentication.getName()
             .trim()
             .toLowerCase();

     // ---------------------------------------------------------
     // Find user
     // ---------------------------------------------------------

     User user = userRepository
             .findByEmail(email)
             .orElseThrow(() ->
                     new RuntimeException(
                             "Utilisateur introuvable."
                     )
             );

     // ---------------------------------------------------------
     // Check role
     // ---------------------------------------------------------

     if (user.getRole() == null ||
             !"pharmacist".equalsIgnoreCase(
                     user.getRole()
             )) {

         throw new RuntimeException(
                 "Accès réservé aux pharmaciens."
         );
     }

     // ---------------------------------------------------------
     // Find pharmacy
     // ---------------------------------------------------------

     Pharmacy pharmacy = pharmacyRepository
             .findByOwnerId(user.getId())
             .orElseThrow(() ->
                     new RuntimeException(
                             "Aucune pharmacie associée à ce compte."
                     )
             );

     // ---------------------------------------------------------
     // Return current user
     // ---------------------------------------------------------

     return new LoginResponse(
             user.getId(),
             pharmacy.getId(),
             user.getFirstName(),
             user.getLastName(),
             user.getEmail(),
             user.getRole()
     );
 }


    // =========================================================
    // STRING VALIDATION HELPER
    // =========================================================

    private boolean isBlank(
            String value
    ) {

        return value == null ||
                value.trim().isEmpty();
    }
    
    @Transactional
    public void changePassword(
            Authentication authentication,
            ChangePasswordRequest request
    ) {

        // =========================================================
        // AUTHENTICATION CHECK
        // =========================================================

        if (authentication == null ||
                !authentication.isAuthenticated()) {

            throw new RuntimeException(
                    "Utilisateur non authentifié."
            );
        }

        // =========================================================
        // REQUEST VALIDATION
        // =========================================================

        if (request == null) {
            throw new RuntimeException(
                    "Les données sont obligatoires."
            );
        }

        if (request.getCurrentPassword() == null ||
                request.getCurrentPassword().isBlank()) {

            throw new RuntimeException(
                    "Le mot de passe actuel est obligatoire."
            );
        }

        if (request.getNewPassword() == null ||
                request.getNewPassword().isBlank()) {

            throw new RuntimeException(
                    "Le nouveau mot de passe est obligatoire."
            );
        }

        if (request.getConfirmPassword() == null ||
                request.getConfirmPassword().isBlank()) {

            throw new RuntimeException(
                    "La confirmation du mot de passe est obligatoire."
            );
        }

        // =========================================================
        // PASSWORD CONFIRMATION
        // =========================================================

        if (!request.getNewPassword()
                .equals(request.getConfirmPassword())) {

            throw new RuntimeException(
                    "Les nouveaux mots de passe ne correspondent pas."
            );
        }

        // =========================================================
        // BASIC PASSWORD RULES
        // =========================================================

        String newPassword = request.getNewPassword();

        if (newPassword.length() < 8) {
            throw new RuntimeException(
                    "Le nouveau mot de passe doit contenir au moins 8 caractères."
            );
        }

        // =========================================================
        // FIND AUTHENTICATED USER
        // =========================================================

        String email =
                authentication.getName()
                        .trim()
                        .toLowerCase();

        User user =
                userRepository
                        .findByEmail(email)
                        .orElseThrow(() ->
                                new RuntimeException(
                                        "Utilisateur introuvable."
                                )
                        );

        // =========================================================
        // VERIFY CURRENT PASSWORD
        // =========================================================

        if (!passwordEncoder.matches(
                request.getCurrentPassword(),
                user.getPassword()
        )) {

            throw new RuntimeException(
                    "Le mot de passe actuel est incorrect."
            );
        }

        // =========================================================
        // PREVENT REUSING SAME PASSWORD
        // =========================================================

        if (passwordEncoder.matches(
                newPassword,
                user.getPassword()
        )) {

            throw new RuntimeException(
                    "Le nouveau mot de passe doit être différent du mot de passe actuel."
            );
        }

        // =========================================================
        // ENCODE USING DJANGO-COMPATIBLE FORMAT
        // =========================================================

        String encodedPassword =
                passwordEncoder.encode(newPassword);

        user.setPassword(encodedPassword);

        userRepository.save(user);
    }
}