// Local stand-in for api.tomtom.com, for checking live mode end to end without a key.
// Responses follow the documented Calculate Route and Fuzzy Search shapes.
import http from "node:http";

function line(a, b, via, n = 60) {
  const pts = [];
  for (let k = 0; k <= n; k++) {
    const t = k / n;
    const [p, q, u] = t < 0.5 ? [a, via, t * 2] : [via, b, (t - 0.5) * 2];
    pts.push({ latitude: p[0] + (q[0] - p[0]) * u, longitude: p[1] + (q[1] - p[1]) * u });
  }
  return pts;
}
function route(o, d, via, mins, km, name, jam) {
  return {
    summary: {
      lengthInMeters: km * 1000,
      travelTimeInSeconds: mins * 60,
      noTrafficTravelTimeInSeconds: mins * 33,
      historicTrafficTravelTimeInSeconds: mins * 63,
    },
    legs: [{ points: line(o, d, via) }],
    sections: [
      { startPointIndex: 5, endPointIndex: 55, sectionType: "IMPORTANT_ROAD_STRETCH", streetName: { text: name } },
      ...(jam
        ? [
            {
              startPointIndex: 25,
              endPointIndex: 33,
              sectionType: "TRAFFIC",
              simpleCategory: "JAM",
              magnitudeOfDelay: 3,
            },
          ]
        : []),
    ],
    guidance: {
      instructions: [
        { routeOffsetInMeters: 0, maneuver: "DEPART", message: "Leave from your start" },
        { routeOffsetInMeters: 1500, maneuver: "TURN_RIGHT", message: `Turn right onto ${name}` },
        { routeOffsetInMeters: km * 600, maneuver: "TURN_LEFT", message: "Turn left at the junction" },
        { routeOffsetInMeters: km * 1000, maneuver: "ARRIVE", message: "You have arrived" },
      ],
    },
  };
}
http
  .createServer((req, res) => {
    const u = new URL(req.url, "http://x");
    if (u.searchParams.get("key") !== "test-key") {
      res.writeHead(403);
      return res.end("<xml/>");
    }
    if (u.pathname.startsWith("/routing/1/calculateRoute/")) {
      const [a, b] = decodeURIComponent(u.pathname.split("/")[4])
        .split(":")
        .map((s) => s.split(",").map(Number));
      const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      res.writeHead(200, { "content-type": "application/json" });
      return res.end(
        JSON.stringify({
          routes: [
            route(a, b, [12.9172, 77.6229], 50, 14.8, "Hosur Road", true),
            route(a, b, [mid[0] - 0.01, mid[1] + 0.03], 54, 16.9, "Haralur Road", false),
            route(a, b, [mid[0] + 0.01, mid[1] - 0.02], 58, 17.4, "Bannerghatta Road", false),
          ],
        }),
      );
    }
    if (u.pathname.startsWith("/search/2/search/")) {
      res.writeHead(200, { "content-type": "application/json" });
      return res.end(
        JSON.stringify({
          results: [
            {
              id: "f1",
              poi: { name: "Forum South Bengaluru" },
              address: { municipalitySubdivision: "Konanakunte" },
              position: { lat: 12.8916, lon: 77.5655 },
            },
            {
              id: "f2",
              poi: { name: "Nexus Koramangala" },
              address: { municipalitySubdivision: "Koramangala" },
              position: { lat: 12.9346, lon: 77.6113 },
            },
          ],
        }),
      );
    }
    res.writeHead(404);
    res.end();
  })
  .listen(4010, () => console.log("fake tomtom on 4010"));
