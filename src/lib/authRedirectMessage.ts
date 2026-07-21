const AUTH_REDIRECT_MESSAGE_KEY = "authRedirectMessage";

export function storeAuthRedirectMessage(message: string) {
    if (typeof window === "undefined") return;
    sessionStorage.setItem(AUTH_REDIRECT_MESSAGE_KEY, message);
}

export function consumeAuthRedirectMessage(): string | null {
    if (typeof window === "undefined") return null;
    const message = sessionStorage.getItem(AUTH_REDIRECT_MESSAGE_KEY);
    if (message) sessionStorage.removeItem(AUTH_REDIRECT_MESSAGE_KEY);
    return message;
}
