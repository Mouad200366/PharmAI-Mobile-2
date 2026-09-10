package com.pharmaai.pharmacy.controller;

import com.pharmaai.pharmacy.dto.LoginRequest;
import com.pharmaai.pharmacy.dto.ChangePasswordRequest;
import com.pharmaai.pharmacy.dto.LoginResponse;
import com.pharmaai.pharmacy.dto.RegisterRequest;
import com.pharmaai.pharmacy.service.AuthService;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

import org.springframework.security.core.Authentication;


@RestController
@RequestMapping("/api/auth")
public class AuthController {

    private final AuthService authService;

    public AuthController(AuthService authService) {
        this.authService = authService;
    }

    // =========================================================
    // LOGIN
    // =========================================================

    @PostMapping("/login")
    public LoginResponse login(
            @RequestBody LoginRequest request,
            HttpServletRequest httpRequest,
            HttpServletResponse httpResponse
    ) {
        return authService.login(
                request,
                httpRequest,
                httpResponse
        );
    }

    // =========================================================
    // REGISTER
    // =========================================================

    @PostMapping("/register")
    public ResponseEntity<LoginResponse> register(
            @RequestBody RegisterRequest request
    ) {

        return ResponseEntity.ok(
                authService.register(request)
        );
    }

 // =========================================================
 // CURRENT AUTHENTICATED USER
 // =========================================================

 @GetMapping("/me")
 public LoginResponse me(
         Authentication authentication
 ) {
     return authService.getCurrentUser(authentication);
 }
//=========================================================
//CHANGE PASSWORD
//=========================================================

@PutMapping("/change-password")
public ResponseEntity<?> changePassword(
      @RequestBody ChangePasswordRequest request,
      Authentication authentication
) {

  authService.changePassword(
          authentication,
          request
  );

  return ResponseEntity.ok(
          java.util.Map.of(
                  "success", true,
                  "message", "Mot de passe modifié avec succès."
          )
  );
}
 
 

 
//=========================================================
//LOGOUT
//=========================================================

@PostMapping("/logout")
public ResponseEntity<Void> logout(
      HttpServletRequest httpRequest
) {

  if (httpRequest.getSession(false) != null) {
      httpRequest.getSession(false).invalidate();
  }

  return ResponseEntity.noContent().build();
}
 
 
 
}