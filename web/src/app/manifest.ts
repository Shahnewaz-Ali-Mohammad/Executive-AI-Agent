/**
 * Web app manifest: lets the CEO "Add to Home Screen" on iPhone/Android and
 * open the assistant full-screen like a native app.
 */
import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Executive Agent",
    short_name: "Exec Agent",
    description: "Private briefings from your documents, with a source for every claim.",
    start_url: "/",
    display: "standalone",
    background_color: "#f3f4f1",
    theme_color: "#1e5a50",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml" }],
  };
}
