export const invitationSubject = (title: string) => `You're invited: ${title}`;
export const invitationGreeting = (name: string, host: string) =>
  `Hi ${name}! ${host} would love to celebrate with you.`;

export function shareMessage(
  title: string,
  name: string,
  host: string,
  url: string,
) {
  return `${invitationSubject(title)}\n\n${invitationGreeting(name, host)}\n\nRespond to invitation: ${url}`;
}

export function smsHref(phone: string, text: string, appleDevice = false) {
  // Never let free-text contact details inject URI parameters or a second recipient.
  const recipient = phone.replace(/[^+0-9]/g, "");
  return `sms:${encodeURIComponent(recipient)}${appleDevice ? "&" : "?"}body=${encodeURIComponent(text)}`;
}
