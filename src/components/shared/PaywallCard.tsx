"use client";

interface PaywallCardProps {
  storiesRemaining: number;
}

export function PaywallCard({ storiesRemaining }: PaywallCardProps) {
  return (
    <div className="story-card paywall-card" style={{
      gridColumn: "1 / -1",
      background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
      color: "#fff",
      textAlign: "center",
      justifyContent: "center",
      alignItems: "center",
      padding: "24px 20px",
    }}>
      <div style={{ fontSize: 40 }}>🔒</div>
      <div style={{ fontWeight: 800, fontSize: 16 }}>
        Unlock All Stories
      </div>
      <div style={{ fontSize: 13, opacity: 0.9, fontWeight: 600 }}>
        {storiesRemaining > 0
          ? `You have ${storiesRemaining} free ${storiesRemaining === 1 ? "story" : "stories"} left`
          : "You've read all your free stories"}
      </div>
      <div style={{ fontSize: 13, opacity: 0.9, fontWeight: 600, marginTop: 4 }}>
        Subscribe for unlimited stories, AI illustrations, and premium narration
      </div>
      <div style={{
        marginTop: 8,
        padding: "10px 24px",
        background: "rgba(255,255,255,0.2)",
        borderRadius: 100,
        fontWeight: 800,
        fontSize: 14,
      }}>
        Coming Soon — $5.99/month
      </div>
    </div>
  );
}
