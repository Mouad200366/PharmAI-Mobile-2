package com.pharmaai.pharmacy.config;

import java.util.List;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.dao.DaoAuthenticationProvider;
import org.springframework.security.config.annotation.authentication.configuration.AuthenticationConfiguration;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.context.HttpSessionSecurityContextRepository;
import org.springframework.security.web.context.SecurityContextRepository;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;

import com.pharmaai.pharmacy.security.CustomUserDetailsService;
import com.pharmaai.pharmacy.security.DjangoPasswordEncoder;

@Configuration
public class SecurityConfig {

    // =========================================================
    // PASSWORD ENCODER
    // =========================================================

    @Bean
    public PasswordEncoder passwordEncoder(
            DjangoPasswordEncoder djangoPasswordEncoder
    ) {
        return djangoPasswordEncoder;
    }

    // =========================================================
    // DAO AUTHENTICATION PROVIDER
    // =========================================================

    @Bean
    public DaoAuthenticationProvider authenticationProvider(
            CustomUserDetailsService userDetailsService,
            DjangoPasswordEncoder djangoPasswordEncoder
    ) {

        DaoAuthenticationProvider provider =
                new DaoAuthenticationProvider(userDetailsService);

        provider.setPasswordEncoder(djangoPasswordEncoder);

        return provider;
    }

    // =========================================================
    // AUTHENTICATION MANAGER
    // =========================================================

    @Bean
    public AuthenticationManager authenticationManager(
            AuthenticationConfiguration configuration
    ) throws Exception {

        return configuration.getAuthenticationManager();
    }

    // =========================================================
    // SECURITY CONTEXT REPOSITORY
    // =========================================================

    @Bean
    public SecurityContextRepository securityContextRepository() {

        return new HttpSessionSecurityContextRepository();
    }

    // =========================================================
    // CORS
    // =========================================================

    @Bean
    public CorsConfigurationSource corsConfigurationSource() {

        CorsConfiguration configuration =
                new CorsConfiguration();

        configuration.setAllowedOrigins(
                List.of(
                        "http://localhost:5173"
                )
        );

        configuration.setAllowCredentials(true);

        configuration.setAllowedMethods(
                List.of(
                        "GET",
                        "POST",
                        "PUT",
                        "DELETE",
                        "OPTIONS"
                )
        );

        configuration.setAllowedHeaders(
                List.of("*")
        );

        UrlBasedCorsConfigurationSource source =
                new UrlBasedCorsConfigurationSource();

        source.registerCorsConfiguration(
                "/**",
                configuration
        );

        return source;
    }

    // =========================================================
    // SECURITY FILTER CHAIN
    // =========================================================

    @Bean
    public SecurityFilterChain securityFilterChain(
            HttpSecurity http,
            SecurityContextRepository securityContextRepository,
            DaoAuthenticationProvider authenticationProvider
    ) throws Exception {

        http

            // -------------------------------------------------
            // CORS
            // -------------------------------------------------

            .cors(cors -> {
            })

            // -------------------------------------------------
            // CSRF
            // -------------------------------------------------

            .csrf(csrf -> csrf.disable())

            // -------------------------------------------------
            // AUTHENTICATION PROVIDER
            // -------------------------------------------------

            .authenticationProvider(
                    authenticationProvider
            )

            // -------------------------------------------------
            // SECURITY CONTEXT
            // -------------------------------------------------

            .securityContext(context ->
                    context
                            .securityContextRepository(
                                    securityContextRepository
                            )
                            .requireExplicitSave(true)
            )

            // -------------------------------------------------
            // AUTHORIZATION
            // -------------------------------------------------

            .authorizeHttpRequests(auth -> auth

            	    .requestMatchers(
            	            HttpMethod.OPTIONS,
            	            "/**"
            	    ).permitAll()

            	    .requestMatchers(
            	            "/api/auth/login",
            	            "/api/auth/register",
                            "/api/public/health"
            	    ).permitAll()

            	    .anyRequest().authenticated()
            	)

            // -------------------------------------------------
            // FORM LOGIN
            // -------------------------------------------------

            .formLogin(form -> form.disable())

            // -------------------------------------------------
            // HTTP BASIC
            // -------------------------------------------------

            .httpBasic(basic -> basic.disable());

        return http.build();
    }
}	