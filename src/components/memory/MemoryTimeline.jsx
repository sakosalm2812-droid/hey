import MemoryCard from "./MemoryCard";


export default function MemoryTimeline({ memories, onDelete }){

  return (

    <div
      style={{
        display:"flex",

        flexDirection:"column",

        gap:20,
      }}
    >

      {memories.length ? (
        memories.map((memory) => (
          <MemoryCard
            key={memory.id}
            {...memory}
            onDelete={onDelete}
          />
        ))
      ) : (
        <div
          style={{
            padding: 28,
            borderRadius: 24,
            color: "var(--text-secondary)",
            background: "var(--glass-bg)",
          }}
        >
          No memories match this search yet.
        </div>
      )}

    </div>

  );
}
