export const modalOverlayStyle = {
    position: "fixed" as const,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: "rgba(15, 23, 42, 0.4)",
    backdropFilter: "blur(4px)",
    display: "flex" as const,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 50,
};

export const modalContentStyle = {
    background: "#fff",
    borderRadius: "16px",
    width: "100%",
    maxWidth: "500px",
    display: "flex",
    flexDirection: "column" as const,
    boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)",
    border: "1px solid #e2e8f0",
};

export const glassCardStyle = {
    background: "rgba(255, 255, 255, 0.9)",
    backdropFilter: "blur(10px)",
    border: "1px solid rgba(226, 232, 240, 0.8)",
    boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -1px rgba(0, 0, 0, 0.03)",
    borderRadius: "16px"
};

export const transitionStyle = {
    transition: "all 0.2s cubic-bezier(0.4, 0, 0.2, 1)"
};
