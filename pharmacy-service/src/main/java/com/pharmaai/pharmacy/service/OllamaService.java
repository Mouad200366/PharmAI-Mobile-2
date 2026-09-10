package com.pharmaai.pharmacy.service;

import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;

import java.util.Map;

@Service
public class OllamaService {

    private final RestClient restClient;

    public OllamaService() {
        this.restClient = RestClient.builder()
                .baseUrl(System.getenv().getOrDefault(
        "OLLAMA_BASE_URL",
        "http://localhost:11434"
))
                .build();
    }

    public String generate(String prompt) {

        Map<String, Object> request = Map.of(
                "model", "llama3.2:1b",
                "prompt", prompt,
                "stream", false
        );

        Map<?, ?> response = restClient.post()
                .uri("/api/generate")
                .body(request)
                .retrieve()
                .body(Map.class);

        if (response == null || response.get("response") == null) {
            throw new RuntimeException(
                    "Ollama n'a retourné aucune réponse."
            );
        }

        return response.get("response").toString();
    }
}