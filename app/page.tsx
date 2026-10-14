import { DetourApp } from "@/components/DetourApp";
import { getProviders } from "@/lib/providers";

export default function Home() {
  // Mode is known on the server, so the demo banner renders without a flash.
  const { mode } = getProviders();
  return <DetourApp initialMode={mode} />;
}
