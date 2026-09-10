package com.pharmaai.pharmacy.controller;

import com.pharmaai.pharmacy.dto.UserResponse;
import com.pharmaai.pharmacy.dto.UserUpdateRequest;
import com.pharmaai.pharmacy.service.UserService;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/user")
public class UserController {

    private final UserService userService;

    public UserController(UserService userService) {
        this.userService = userService;
    }

    @GetMapping("/{userId}")
    public UserResponse getUser(
            @PathVariable Long userId
    ) {
        return userService.getUser(userId);
    }

    @PutMapping("/{userId}")
    public UserResponse updateUser(
            @PathVariable Long userId,
            @RequestBody UserUpdateRequest request
    ) {
        return userService.updateUser(userId, request);
    }
}