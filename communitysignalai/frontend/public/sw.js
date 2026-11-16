self.addEventListener("push", (event) => {
  let message;
  try {
    message = event.data ? event.data.json() : {};
  } catch {
    message = { title: "PeopleCare AI alert", body: "New community activity is available." };
  }

  const title = typeof message.title === "string" ? message.title : "PeopleCare AI alert";
  const options = {
    body: typeof message.body === "string" ? message.body : "Open the admin console to review recent activity.",
    icon: "/peoplecare-pwa.svg",
    badge: "/peoplecare-pwa.svg",
    tag: typeof message.tag === "string" ? message.tag : "peoplecare-activity",
    renotify: false,
    requireInteraction: true,
    vibrate: Array.isArray(message.vibrate) ? message.vibrate : [180, 80, 180],
    data: { url: typeof message.url === "string" ? message.url : "/admin" },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || "/admin", self.location.origin);
  if (target.origin !== self.location.origin) return;

  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const existing = windows.find((client) => new URL(client.url).origin === self.location.origin);
    if (existing) {
      await existing.focus();
      if ("navigate" in existing) await existing.navigate(target.href);
      return;
    }
    await self.clients.openWindow(target.href);
  })());
});
