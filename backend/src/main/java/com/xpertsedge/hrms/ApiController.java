package com.xpertsedge.hrms;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.http.ResponseCookie;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;
import java.util.*;
import java.nio.charset.StandardCharsets;
import org.springframework.transaction.annotation.Transactional;

@RestController @RequestMapping("/api")
public class ApiController {
  @org.springframework.beans.factory.annotation.Autowired private MailProvider mailProvider;
  @org.springframework.beans.factory.annotation.Autowired private WebmailSessionRepo webmailSessions;
  private final MailNamespaceRepo namespace;
  private void lockMail() { namespace.findById(1L).orElseThrow(() -> new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE,"Mail workspace is initializing. Please retry.")); }
  @Value("${hrms.auth.cookie-secure:false}") private boolean secureCookie;
  @Value("${hrms.mail.domain:xpertsedgetech.com}") private String mailDomain;
  private final AdminAuthService authService;
  private final NotificationService notices; private final NotificationRepo notificationRepo;
  private final UserRepo users; private final MailboxRepo boxes; private final AliasRepo aliases; private final JwtService jwt; private final BCryptPasswordEncoder enc; private final WebmailAuth webmailAuth;
  public ApiController(UserRepo u, MailboxRepo b, AliasRepo a, JwtService j, BCryptPasswordEncoder e, NotificationService n, NotificationRepo nr, AdminAuthService authService, MailNamespaceRepo namespace, WebmailAuth webmailAuth) { users = u; boxes = b; aliases = a; jwt = j; enc = e; notices=n; notificationRepo=nr; this.authService=authService; this.namespace=namespace;this.webmailAuth=webmailAuth; }

  private static ResponseStatusException bad(String m) { return new ResponseStatusException(HttpStatus.BAD_REQUEST, m); }
  private static String str(Map<String, Object> b, String k) { return b.get(k) instanceof String || b.get(k) instanceof Number ? b.get(k).toString().trim() : ""; }
  private static String address(Map<String, Object> b, String key) {
    if(!(b.get(key) instanceof String)) throw bad("Address must be text.");
    String a = str(b, key).toLowerCase(Locale.ROOT);
    if (!a.matches("[a-z0-9_-]+(?:[.][a-z0-9_-]+)*") || a.length() > 64) throw bad("Enter a valid address (maximum 64 characters).");
    return a;
  }
  private static String password(Map<String, Object> b) {
    String p = b.get("password") instanceof String ? (String) b.get("password") : "";
    if (p.isBlank() || p.length() < 8 || p.getBytes(StandardCharsets.UTF_8).length > 72) throw bad("Password must contain at least 8 characters and at most 72 bytes.");
    return p;
  }
  private static int quota(Map<String, Object> b) {
    try { int value = Integer.parseInt(str(b, "quotaGb")); if (value >= 1 && value <= 1000) return value; }
    catch (NumberFormatException ignored) {}
    throw bad("Quota must be a whole number between 1 and 1000 GB.");
  }
  private static String displayName(Map<String,Object> b, String fallback) {
    if(!b.containsKey("displayName")) return fallback;
    if(!(b.get("displayName") instanceof String)) throw bad("Display name must be text.");
    String name=str(b,"displayName");
    if(name.length()>200 || name.chars().anyMatch(Character::isISOControl)) throw bad("Display name must be at most 200 characters without control characters.");
    return name.isEmpty() ? fallback : name;
  }
  private static String mailboxRole(Map<String,Object> b) {
    String role=str(b,"accessRole").toUpperCase(Locale.ROOT);
    if(!Set.of("ADMIN","HR_ADMIN","MAIL_ADMIN","EMPLOYEE").contains(role)) throw bad("Choose a valid access level.");
    return role;
  }
  private static Map<String, Object> view(AppUser u) {
    return OrgController.viewUser(u); }
  private Mailbox box(Long id) { return boxes.findById(id).orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Mailbox not found")); }

  // ---- auth
  @PostMapping("/auth/login")
  public Map<String, Object> login(@RequestBody Map<String, Object> b, HttpServletResponse response) {
    AppUser u=authService.login(b.get("email"),b.get("password")); String token=jwt.create(u.email);
    response.addHeader("Set-Cookie",ResponseCookie.from("xe_session",token).httpOnly(true).secure(secureCookie).sameSite("Strict").path("/api").maxAge(jwt.lifetimeSeconds()).build().toString());
    return Map.of("user", view(u),"expiresIn",jwt.lifetimeSeconds());
  }
  @PostMapping("/auth/logout") @ResponseStatus(HttpStatus.NO_CONTENT)
  public void logout(HttpServletRequest request, HttpServletResponse response) {
    jwt.revoke((String)request.getAttribute("authToken"));
    response.addHeader("Set-Cookie",ResponseCookie.from("xe_session","").httpOnly(true).secure(secureCookie).sameSite("Strict").path("/api").maxAge(0).build().toString());
  }
  @PostMapping("/auth/webmail-session")
  public Map<String,Object> startAdministratorWebmail(HttpServletRequest request,HttpServletResponse response) {
    if(!"ADMIN".equals(request.getAttribute("role"))) throw new ResponseStatusException(HttpStatus.FORBIDDEN,"Administrator access is required.");
    AppUser user=users.findByEmail((String)request.getAttribute("email")).orElseThrow(()->new ResponseStatusException(HttpStatus.UNAUTHORIZED,"Account not found"));
    return Map.of("user",webmailAuth.view(webmailAuth.loginAdministrator(user,response)));
  }
  @GetMapping("/me")
  public Map<String, Object> me(HttpServletRequest q) { return view(users.findByEmail((String) q.getAttribute("email")).orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Account not found"))); }
  @PostMapping("/auth/change-password") @ResponseStatus(HttpStatus.NO_CONTENT)
  public void changePassword(@RequestBody Map<String,Object> body, HttpServletRequest request, HttpServletResponse response) {
    String next=password(body);
    if(next.length()<12 || "Admin@123".equals(next)) throw bad("Choose a new password of at least 12 characters (maximum 72 bytes).");
    AppUser user=authService.login(request.getAttribute("email"),body.get("currentPassword"));
    if(enc.matches(next,user.passwordHash)) throw bad("Choose a different password.");
    authService.updatePassword(user,next);
    response.addHeader("Set-Cookie",ResponseCookie.from("xe_session","").httpOnly(true).secure(secureCookie).sameSite("Strict").path("/api").maxAge(0).build().toString());
  }

  // ---- authenticated notifications
  @GetMapping("/notifications")
  public List<AppNotification> notifications(HttpServletRequest q) { return notificationRepo.findTop100ByRecipientOrderByCreatedAtDescIdDesc((String)q.getAttribute("email")); }
  @GetMapping("/notifications/summary") public Map<String,Long> notificationSummary(HttpServletRequest q) { return Map.of("unreadCount",notificationRepo.countByRecipientAndReadFalse((String)q.getAttribute("email"))); }
  @PostMapping("/notifications/read-all") @Transactional
  public Map<String,Integer> readAllNotifications(HttpServletRequest q) { return Map.of("updated",notificationRepo.markAllRead((String)q.getAttribute("email"))); }
  @PostMapping("/notifications/{id}/read")
  public AppNotification readNotification(@PathVariable Long id, HttpServletRequest q) {
    AppNotification n=notificationRepo.findByIdAndRecipient(id,(String)q.getAttribute("email")).orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND,"Notification not found"));
    n.read=true; return notificationRepo.save(n);
  }
  @DeleteMapping("/notifications/{id}") @ResponseStatus(HttpStatus.NO_CONTENT)
  public void dismissNotification(@PathVariable Long id, HttpServletRequest q) {
    AppNotification n=notificationRepo.findByIdAndRecipient(id,(String)q.getAttribute("email")).orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND,"Notification not found")); notificationRepo.delete(n);
  }
  // ---- mail: mailboxes
  @GetMapping("/mail/check") public Map<String, Object> check() { return mailProvider.status(); }
  @GetMapping("/mail/mailboxes") public List<Mailbox> list() { return boxes.findAll(); }

  @PostMapping("/mail/mailboxes")
  @Transactional public Mailbox create(@RequestBody Map<String, Object> b, HttpServletRequest request) {
    lockMail();
    String a = address(b, "address");
    if (boxes.existsByAddress(a) || aliases.existsByAlias(a)) throw bad("That address already exists.");
    String role=mailboxRole(b);
    // A mail administrator can provision employee mailboxes but cannot grant
    // HRMS administrator, HR administrator or mail administrator privileges.
    if(!"ADMIN".equals(request.getAttribute("role")) && !"EMPLOYEE".equals(role))
      throw new ResponseStatusException(HttpStatus.FORBIDDEN,"Only an HRMS administrator can assign administrator privileges.");
    String rawPassword=password(b), accountEmail=a+"@"+mailDomain.trim().toLowerCase(Locale.ROOT);
    AppUser account=users.findByEmail(accountEmail).orElse(null);
    if(account!=null && !role.equals(account.role))
      throw bad("This email already has an HRMS account. Change its access level from Organization > Users.");
    Mailbox m = new Mailbox(); m.address = a; m.displayName = displayName(b,a);
    m.accessRole=role;
    m.quotaGb = b.containsKey("quotaGb") ? quota(b) : 2;
    m.passwordHash = enc.encode(rawPassword); boxes.save(m);
    if(account==null){
      account=new AppUser(); account.email=accountEmail; account.name=m.displayName; account.role=role;
      account.active=true; account.passwordHash=enc.encode(rawPassword); users.save(account);
    }
    notices.add("Mailbox record created",m.address+" was created with "+role+" access. Mail provider is not connected."); return m;
  }
  @PutMapping("/mail/mailboxes/{id}")
  @Transactional public Mailbox edit(@PathVariable Long id, @RequestBody Map<String, Object> b) {
    lockMail();
    Mailbox m = box(id); if(b.containsKey("displayName")) m.displayName=displayName(b,m.address);
    if (b.containsKey("quotaGb")) m.quotaGb = quota(b); boxes.save(m); notices.add("Mailbox record updated",m.address + " settings were updated locally."); return m; }
  @PostMapping("/mail/mailboxes/{id}/reset-password")
  @Transactional public Map<String, Object> reset(@PathVariable Long id, @RequestBody Map<String, Object> b) {
    lockMail();
    Mailbox m = box(id);
    m.passwordHash = enc.encode(password(b)); boxes.save(m); webmailSessions.deleteByOwnerId(m.id); notices.add("Local mailbox password reset",m.address + " local password was updated."); return Map.of("ok", true); }
  @PostMapping("/mail/mailboxes/{id}/toggle")
  @Transactional public Mailbox toggle(@PathVariable Long id) { lockMail(); Mailbox m = box(id); m.active = !m.active; boxes.save(m); if(!m.active)webmailSessions.deleteByOwnerId(m.id); notices.add("Mailbox record status changed",m.address + (m.active ? " was reactivated locally." : " was suspended locally.")); return m; }
  @DeleteMapping("/mail/mailboxes/{id}") @ResponseStatus(HttpStatus.NO_CONTENT)
  @Transactional public void delete(@PathVariable Long id) {
    lockMail();
    Mailbox m = box(id); aliases.deleteAll(aliases.findAll().stream().filter(a -> a.target.equals(m.address)).toList()); boxes.delete(m); notices.add("Mailbox record deleted",m.address + " and its local aliases were removed."); }

  // ---- mail: aliases
  @GetMapping("/mail/aliases") public List<Alias> aliasList() { return aliases.findAll(); }
  @PostMapping("/mail/aliases")
  @Transactional public Alias aliasCreate(@RequestBody Map<String, Object> b) {
    lockMail();
    String a = address(b, "alias"), t = address(b, "target");
    if (aliases.existsByAlias(a) || boxes.existsByAddress(a)) throw bad("That address already exists.");
    if (!boxes.existsByAddress(t)) throw bad("Choose an existing mailbox.");
    Alias x = new Alias(); x.alias = a; x.target = t; aliases.save(x); notices.add("Alias record created",a + " was linked locally to " + t + "."); return x; }
  @PutMapping("/mail/aliases/{id}") @Transactional
  public Alias aliasEdit(@PathVariable Long id, @RequestBody Map<String,Object> b) {
    lockMail();
    Alias x=aliases.findById(id).orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND,"Alias not found"));
    String a=address(b,"alias"), target=address(b,"target");
    if(!a.equals(x.alias) && (aliases.existsByAlias(a) || boxes.existsByAddress(a))) throw bad("That address already exists.");
    if(!boxes.existsByAddress(target)) throw bad("Choose an existing mailbox.");
    if(!x.alias.equals(a)||!x.target.equals(target))x.createdAt=java.time.Instant.now(); x.alias=a; x.target=target; aliases.save(x); notices.add("Alias record updated",a + " was linked locally to " + target + "."); return x;
  }
  @DeleteMapping("/mail/aliases/{id}") @ResponseStatus(HttpStatus.NO_CONTENT)
  @Transactional public void aliasDelete(@PathVariable Long id) { lockMail(); Alias a=aliases.findById(id).orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Alias not found")); aliases.delete(a); notices.add("Alias record deleted",a.alias + " was removed locally."); }
}

