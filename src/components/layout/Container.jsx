export default function Container({ children, className = "" }) {
    return (
      <div
        className={className}
        style={{
          width: "100%",
          maxWidth: "1320px",
          margin: "0 auto",
          padding: "0 var(--space-5)",
        }}
      >
        {children}
      </div>
    );
  }