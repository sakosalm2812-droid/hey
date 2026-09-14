import { Search } from "lucide-react";

export default function HEYInput({
  value,
  onChange,
  placeholder = "",
  icon,
  type = "text",
  style = {},
  ...props
}) {
  const LeftIcon = icon || Search;

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,

        width: "100%",

        background: "var(--glass-bg)",

        border: "1px solid var(--border)",

        backdropFilter: "blur(20px)",
        WebkitBackdropFilter: "blur(20px)",

        borderRadius: 18,

        padding: "14px 18px",

        transition: ".25s",

        ...style,
      }}
    >
      <LeftIcon
        size={18}
        color="var(--text-secondary)"
      />

      <input
        {...props}
        type={type}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        style={{
          flex: 1,

          background: "transparent",

          border: "none",

          outline: "none",

          color: "var(--text-primary)",

          fontSize: 15,
        }}
      />
    </div>
  );
}