package com.pharmaai.pharmacy.security;

import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;

import javax.crypto.SecretKeyFactory;
import javax.crypto.spec.PBEKeySpec;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.util.Base64;

@Component
public class DjangoPasswordEncoder implements PasswordEncoder {

    // =========================================================
    // DJANGO PBKDF2 SETTINGS
    // =========================================================

    private static final String ALGORITHM = "pbkdf2_sha256";

    private static final int DEFAULT_ITERATIONS = 1_000_000;

    private static final int KEY_LENGTH = 256;

    private static final int SALT_LENGTH = 22;

    // Django-compatible salt characters
    private static final String SALT_CHARACTERS =
            "abcdefghijklmnopqrstuvwxyz"
                    + "ABCDEFGHIJKLMNOPQRSTUVWXYZ"
                    + "0123456789";

    private final SecureRandom secureRandom =
            new SecureRandom();


    // =========================================================
    // ENCODE PASSWORD
    // =========================================================

    @Override
    public String encode(CharSequence rawPassword) {

        if (rawPassword == null) {
            throw new IllegalArgumentException(
                    "Le mot de passe ne peut pas être null."
            );
        }

        String salt = generateSalt();

        byte[] hash = generateHash(
                rawPassword.toString(),
                salt,
                DEFAULT_ITERATIONS
        );

        String encodedHash =
                Base64.getEncoder()
                        .encodeToString(hash);

        return ALGORITHM
                + "$"
                + DEFAULT_ITERATIONS
                + "$"
                + salt
                + "$"
                + encodedHash;
    }


    // =========================================================
    // VERIFY PASSWORD
    // =========================================================

    @Override
    public boolean matches(
            CharSequence rawPassword,
            String encodedPassword
    ) {

        if (rawPassword == null ||
                encodedPassword == null ||
                encodedPassword.isBlank()) {

            return false;
        }

        try {

            // -------------------------------------------------
            // Django format:
            //
            // pbkdf2_sha256$iterations$salt$hash
            //
            // IMPORTANT:
            // "\\$" means split on the literal "$" character.
            // -------------------------------------------------

        	String[] parts =
        	        encodedPassword.split(
        	                "\\$",
        	                -1
        	        );

            // Django password must contain:
            //
            // 1. algorithm
            // 2. iterations
            // 3. salt
            // 4. hash

            if (parts.length != 4) {
                return false;
            }


            // -------------------------------------------------
            // Check algorithm
            // -------------------------------------------------

            if (!ALGORITHM.equals(parts[0])) {
                return false;
            }


            // -------------------------------------------------
            // Read iterations
            // -------------------------------------------------

            int iterations;

            try {

                iterations =
                        Integer.parseInt(parts[1]);

            } catch (NumberFormatException e) {

                return false;
            }


            // -------------------------------------------------
            // Validate parameters
            // -------------------------------------------------

            if (iterations <= 0 ||
                    parts[2].isBlank() ||
                    parts[3].isBlank()) {

                return false;
            }


            String salt =
                    parts[2];

            String expectedHash =
                    parts[3];


            // -------------------------------------------------
            // Generate hash using Django parameters
            // -------------------------------------------------

            byte[] calculatedHash =
                    generateHash(
                            rawPassword.toString(),
                            salt,
                            iterations
                    );


            // -------------------------------------------------
            // Encode calculated hash
            // -------------------------------------------------

            String calculatedHashBase64 =
                    Base64.getEncoder()
                            .encodeToString(
                                    calculatedHash
                            );


            // -------------------------------------------------
            // Constant-time comparison
            // -------------------------------------------------

            return MessageDigest.isEqual(
                    calculatedHashBase64.getBytes(
                            StandardCharsets.UTF_8
                    ),
                    expectedHash.getBytes(
                            StandardCharsets.UTF_8
                    )
            );

        } catch (Exception e) {

            return false;
        }
    }


    // =========================================================
    // GENERATE PBKDF2 HASH
    // =========================================================

    private byte[] generateHash(
            String rawPassword,
            String salt,
            int iterations
    ) {

        try {

            SecretKeyFactory factory =
                    SecretKeyFactory.getInstance(
                            "PBKDF2WithHmacSHA256"
                    );

            PBEKeySpec spec =
                    new PBEKeySpec(
                            rawPassword.toCharArray(),
                            salt.getBytes(
                                    StandardCharsets.UTF_8
                            ),
                            iterations,
                            KEY_LENGTH
                    );

            try {

                return factory
                        .generateSecret(spec)
                        .getEncoded();

            } finally {

                spec.clearPassword();
            }

        } catch (Exception e) {

            throw new IllegalStateException(
                    "Erreur lors du calcul du hash PBKDF2.",
                    e
            );
        }
    }


    // =========================================================
    // GENERATE DJANGO-STYLE SALT
    // =========================================================

    private String generateSalt() {

        StringBuilder salt =
                new StringBuilder(SALT_LENGTH);

        for (int i = 0;
             i < SALT_LENGTH;
             i++) {

            int index =
                    secureRandom.nextInt(
                            SALT_CHARACTERS.length()
                    );

            salt.append(
                    SALT_CHARACTERS.charAt(index)
            );
        }

        return salt.toString();
    }
}