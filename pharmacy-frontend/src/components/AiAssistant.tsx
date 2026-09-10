
import React, { useState } from "react";
import "./AiAssistant.css";
import { aiApi } from "../services/api";

interface AiAssistantProps {
    pharmacyId: number;
}

function AiAssistant({ pharmacyId }: AiAssistantProps) {
    const [question, setQuestion] = useState("");
    const [answer, setAnswer] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");

    const askAI = async () => {
        if (!question.trim()) {
            return;
        }

        setLoading(true);
        setError("");
        setAnswer("");

        try {
            const lowerQuestion = question.toLowerCase();

            const isStockQuestion =
                lowerQuestion.includes("stock") ||
                lowerQuestion.includes("rupture") ||
                lowerQuestion.includes("réapprovisionnement") ||
                lowerQuestion.includes("reapprovisionnement") ||
                lowerQuestion.includes("disponible") ||
                lowerQuestion.includes("quantité") ||
                lowerQuestion.includes("quantite") ||
                lowerQuestion.includes("médicament en rupture") ||
                lowerQuestion.includes("medicament en rupture");

            let data: string;

            if (isStockQuestion) {
                // Question concernant le stock
                data = await aiApi.analyzeStock(pharmacyId);
            } else {
                // Question concernant les commandes / assistant IA
                data = await aiApi.askPharmacy(
                    pharmacyId,
                    question
                );
            }

            setAnswer(data);

        } catch (err) {
            console.error("Erreur Assistant IA:", err);

            if (err instanceof Error) {
                console.error(err.message);
            }

            setError(
                "Impossible de contacter l'assistant IA."
            );

        } finally {
            setLoading(false);
        }
    };

    const formatLine = (line: string) => {
        const parts = line.split("**");

        return parts.map((part, index) =>
            index % 2 === 1 ? (
                <strong key={index}>{part}</strong>
            ) : (
                <React.Fragment key={index}>
                    {part}
                </React.Fragment>
            )
        );
    };

    const handleKeyDown = (
        event: React.KeyboardEvent<HTMLTextAreaElement>
    ) => {
        if (event.key === "Enter" && event.ctrlKey) {
            event.preventDefault();
            askAI();
        }
    };

    return (
        <div className="ai-assistant">

            <div className="ai-assistant-header">
                <div className="ai-assistant-icon">
                    🤖
                </div>

                <div>
                    <h2 className="ai-assistant-title">
                        Assistant IA
                    </h2>

                    <p className="ai-assistant-description">
                        Posez une question sur les commandes de votre pharmacie.
                    </p>
                </div>
            </div>

            <div className="ai-assistant-input-section">

                <textarea
                    className="ai-assistant-textarea"
                    value={question}
                    onChange={(e) => setQuestion(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Exemple : Quelles commandes nécessitent une attention ?"
                    rows={4}
                    disabled={loading}
                />

                <div className="ai-assistant-actions">

                    <button
                        className="ai-assistant-button"
                        onClick={askAI}
                        disabled={loading || !question.trim()}
                    >
                        {loading ? (
                            <>
                                <span className="ai-spinner"></span>
                                Analyse en cours...
                            </>
                        ) : (
                            <>
                                ✨ Demander à l'IA
                            </>
                        )}
                    </button>

                    <span className="ai-assistant-hint">
                        Ctrl + Entrée pour envoyer
                    </span>

                </div>
            </div>

            {error && (
                <div className="ai-assistant-error">
                    <span className="ai-error-icon">
                        ⚠
                    </span>

                    <span>
                        {error}
                    </span>
                </div>
            )}

            {answer && (
                <div className="ai-assistant-response">

                    <div className="ai-assistant-response-header">
                        <div className="ai-response-icon">
                            🤖
                        </div>

                        <h3 className="ai-assistant-response-title">
                            Réponse de l'assistant
                        </h3>
                    </div>

                    <div className="ai-assistant-response-content">
                        {answer.split("\n").map((line, index) => (
                            <div
                                key={index}
                                className="ai-assistant-response-line"
                            >
                                {formatLine(line)}
                            </div>
                        ))}
                    </div>

                </div>
            )}

        </div>
    );
}

export default AiAssistant;

