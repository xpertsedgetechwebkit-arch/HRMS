package com.xpertsedge.hrms;
import jakarta.servlet.http.*;
import jakarta.mail.internet.InternetAddress;
import java.time.Instant;
import java.util.*;
import org.springframework.web.bind.annotation.*;
import org.springframework.http.*;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.data.domain.*;
@RestController @RequestMapping("/api/webmail")
public class WebmailController {
  static final Set<String> FOLDERS=Set.of("Inbox","Drafts","Scheduled","Sent","Spam","Trash","Archive");
  private final WebmailAuth auth;private final LocalMailBridge bridge;private final WebmailMessageRepo messages;
  private final MailNamespaceRepo namespace;private final MailboxRepo boxes;private final AliasRepo aliases;
  @org.springframework.beans.factory.annotation.Autowired private GmailSmtp gmail;
  @org.springframework.beans.factory.annotation.Autowired private GmailApi gmailApi;
  @org.springframework.beans.factory.annotation.Autowired private GmailAccountRepo gmailAccounts;
  @org.springframework.beans.factory.annotation.Autowired private MailerSendTransport mailerSend;
  @org.springframework.beans.factory.annotation.Autowired private WebmailFiles files;
  @org.springframework.beans.factory.annotation.Autowired private WebmailAttachmentRepo attachments;
  @org.springframework.beans.factory.annotation.Autowired private WebmailDeletedCaptureRepo deleted;
  @org.springframework.beans.factory.annotation.Value("${hrms.local-mail.enabled:false}") private boolean localMailEnabled;
  public WebmailController(WebmailAuth auth,LocalMailBridge bridge,WebmailMessageRepo messages,MailNamespaceRepo namespace,MailboxRepo boxes,AliasRepo aliases){this.auth=auth;this.bridge=bridge;this.messages=messages;this.namespace=namespace;this.boxes=boxes;this.aliases=aliases;}
  void lock(){namespace.findById(1L).orElseThrow(()->new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE,"Mail workspace is starting."));}
  @PostMapping("/login") public Map<String,Object> login(@RequestBody Map<String,Object> body,HttpServletResponse response){return Map.of("user",auth.view(auth.login(body,response)));}
  @GetMapping("/me") public Map<String,Object> me(HttpServletRequest request){return auth.view(auth.current(request));}
  @PostMapping("/logout") @ResponseStatus(HttpStatus.NO_CONTENT) public void logout(HttpServletRequest request,HttpServletResponse response){auth.logout(request,response);}
  /** The single shared company Gmail account, or null when Gmail API is not configured/connected. */
  GmailAccount companyGmail(){return gmailApi.enabled()?gmailAccounts.findFirstByOrderByConnectedAtAsc().orElse(null):null;}
  boolean providerEnabled(){return mailerSend.configured();}
  boolean externalAllowed(Mailbox box){return providerEnabled();}
  String senderEmail(Mailbox box){return providerEnabled()?auth.email(box):"";}
  String sendExternal(Mailbox box,WebmailMessage message,String to,String cc,List<WebmailAttachment> files){
    if(providerEnabled()){String from=auth.email(box);MailTransport.SendResult sent=mailerSend.send(new MailTransport.OutgoingMail(message.id,from,to,cc,message.subject,message.body,files));message.providerMessageId=sent.providerMessageId();message.replyToAddress=mailerSend.replyTo(from);return from;}
    throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE,"MailerSend is not configured.");
  }
  @GetMapping("/status") public Map<String,Object> status(HttpServletRequest request){Mailbox box=auth.current(request);return Map.of("local",localMailEnabled,"connected",providerEnabled()||(localMailEnabled&&bridge.ready()),"externalAllowed",externalAllowed(box),"senderEmail",senderEmail(box),"gmailConnected",companyGmail()!=null,"provider",providerEnabled()?"mailersend":localMailEnabled?"local":"unconfigured");}
  @PostMapping("/smtp/check") public Map<String,Object> verifySmtp(HttpServletRequest request){Mailbox box=auth.current(request);GmailAccount account=companyGmail();if(account!=null)return Map.of("authenticated",true,"senderEmail",account.gmailAddress);gmail.verify(auth.email(box));return Map.of("authenticated",true,"senderEmail",gmail.senderEmail());}
  Specification<WebmailMessage> owner(Long id){return (root,query,cb)->cb.equal(root.get("ownerId"),id);}
  Specification<WebmailMessage> inFolder(String folder){return (root,query,cb)->cb.equal(root.get("folder"),folder);}
  @GetMapping("/messages") @Transactional public Map<String,Object> list(@RequestParam(defaultValue="0") int page,@RequestParam(defaultValue="") String folder,@RequestParam(defaultValue="") String q,@RequestParam(defaultValue="") String tag,@RequestParam(defaultValue="") String read,@RequestParam(defaultValue="") String after,@RequestParam(defaultValue="") String before,@RequestParam(defaultValue="false") boolean hasAttachment,HttpServletRequest request){
    if(page<0||page>10000||q.length()>200||(!folder.isEmpty()&&!FOLDERS.contains(folder)))throw bad("Invalid message search.");
    lock();Mailbox box=auth.current(request);boolean connected=providerEnabled()||(localMailEnabled&&bridge.ready());if(!providerEnabled()&&localMailEnabled&&connected&&page==0)bridge.sync(box,auth.email(box),messages);
    Specification<WebmailMessage> spec=owner(box.id);
    if(!folder.isEmpty())spec=spec.and(inFolder(folder));
    if(!tag.isEmpty())spec=spec.and((root,query,cb)->cb.equal(root.get("tag"),tag));
    if(!q.isBlank()){
      String pattern="%"+q.trim().toLowerCase(Locale.ROOT).replace("\\","\\\\").replace("%","\\%").replace("_","\\_")+"%";
      spec=spec.and((root,query,cb)->cb.or(cb.like(cb.lower(root.get("subject")),pattern,'\\'),cb.like(cb.lower(root.get("body").as(String.class)),pattern,'\\'),cb.like(cb.lower(root.get("fromAddress")),pattern,'\\'),cb.like(cb.lower(root.get("toAddress")),pattern,'\\'),cb.like(cb.lower(root.get("ccAddress")),pattern,'\\')));
    }
    if(!read.isEmpty()){if(!Set.of("read","unread").contains(read))throw bad("Invalid read filter.");spec=spec.and((root,query,cb)->cb.equal(root.get("seen"),read.equals("read")));}
    try{if(!after.isEmpty()){Instant at=java.time.LocalDate.parse(after).atStartOfDay(java.time.ZoneOffset.UTC).toInstant();spec=spec.and((root,query,cb)->cb.greaterThanOrEqualTo(root.get("createdAt"),at));}if(!before.isEmpty()){Instant at=java.time.LocalDate.parse(before).plusDays(1).atStartOfDay(java.time.ZoneOffset.UTC).toInstant();spec=spec.and((root,query,cb)->cb.lessThan(root.get("createdAt"),at));}}catch(java.time.DateTimeException e){throw bad("Use valid filter dates.");}
    if(hasAttachment)spec=spec.and((root,query,cb)->{var sub=query.subquery(String.class);var file=sub.from(WebmailAttachment.class);sub.select(file.get("messageId")).where(cb.equal(file.get("messageId"),root.get("id")));return cb.exists(sub);});
    var result=messages.findAll(spec,PageRequest.of(page,200,Sort.by(Sort.Order.desc("createdAt"),Sort.Order.desc("id"))));
    Map<String,Long> counts=new HashMap<>();for(String name:FOLDERS)counts.put(name,messages.count(owner(box.id).and(inFolder(name)).and((root,query,cb)->cb.isFalse(root.get("seen")))));
    long unread=messages.count(owner(box.id).and(inFolder("Inbox")).and((root,query,cb)->cb.isFalse(root.get("seen"))));
    return Map.of("messages",result.getContent().stream().map(files::view).toList(),"connected",connected,"hasMore",result.hasNext(),"total",result.getTotalElements(),"externalAllowed",externalAllowed(box),"senderEmail",senderEmail(box),"gmailConnected",companyGmail()!=null,"provider",providerEnabled()?"mailersend":localMailEnabled?"local":"unconfigured","counts",counts,"unread",unread);
  }
  static String text(Map<String,Object> body,String key,int max){Object value=body.get(key);if(!(value instanceof String s)||s.length()>max)throw bad(key+" must be text (maximum "+max+" characters).");return (String)value;}
  static ResponseStatusException bad(String reason){return new ResponseStatusException(HttpStatus.BAD_REQUEST,reason);}
  WebmailMessage owned(String id,Mailbox box){return messages.findByIdAndOwnerId(id,box.id).orElseThrow(()->new ResponseStatusException(HttpStatus.NOT_FOUND,"Message not found"));}
  static List<String> addresses(String input){
    if(input.isBlank())return List.of();
    try{if(input.length()>2000||input.chars().anyMatch(Character::isISOControl))throw new Exception();LinkedHashSet<String> result=new LinkedHashSet<>();
      for(InternetAddress address:InternetAddress.parse(input.replace(';',','),true)){address.validate();if(address.getPersonal()!=null||address.isGroup())throw new Exception();result.add(address.getAddress().toLowerCase(Locale.ROOT));}
      if(result.size()>20)throw new Exception();return List.copyOf(result);
    }catch(Exception error){throw bad("Enter valid email addresses separated by commas (maximum 20 recipients).");}
  }
  void applyDraft(WebmailMessage message,Map<String,Object> body){
    List<String> to=addresses(text(body,"to",2000)),cc=body.containsKey("cc")?addresses(text(body,"cc",2000)):List.of();
    LinkedHashSet<String> everyone=new LinkedHashSet<>(to);everyone.addAll(cc);if(everyone.size()>20)throw bad("Maximum 20 recipients.");
    if(!providerEnabled()&&!gmail.enabled()&&companyGmail()==null&&everyone.stream().anyMatch(address->!address.endsWith("@"+auth.domain())))throw bad("Local mode can send only to @"+auth.domain()+" mailboxes.");
    message.toAddress=String.join(", ",to);message.ccAddress=String.join(", ",cc.stream().filter(address->!to.contains(address)).toList());
    message.subject=text(body,"subject",255);message.body=text(body,"body",20000);message.tag=body.containsKey("tag")?text(body,"tag",20):"";
    if(!Set.of("","Red","Orange","Yellow","Green","Blue","Purple","Pink").contains(message.tag))throw bad("Invalid tag.");
    if(message.subject.chars().anyMatch(c->c=='\r'||c=='\n'))throw bad("Subject cannot contain line breaks.");
    boolean hasFiles=(body.get("attachments") instanceof List<?> uploads&&!uploads.isEmpty())||(body.get("attachmentIds") instanceof List<?> ids&&!ids.isEmpty())||(!body.containsKey("attachmentIds")&&!attachments.metadata(message.id).isEmpty());
    if(message.toAddress.isBlank()&&message.ccAddress.isBlank()&&message.subject.isBlank()&&message.body.isBlank()&&!hasFiles)throw bad("Draft cannot be empty.");
    message.updatedAt=Instant.now();
  }
  WebmailMessage fresh(Mailbox box){WebmailMessage message=new WebmailMessage();message.id=UUID.randomUUID().toString();message.ownerId=box.id;message.fromAddress=auth.email(box);return message;}
  WebmailMessage saveDraft(WebmailMessage message,Map<String,Object> body,Mailbox box,boolean isNew){
    WebmailMessage source=null;if(isNew&&body.get("forwardFromId") instanceof String id)source=owned(id,box);
    applyDraft(message,body);messages.saveAndFlush(message);files.apply(message,body,source);return files.view(message);
  }
  @PostMapping("/drafts") @Transactional public WebmailMessage draft(@RequestBody Map<String,Object> body,HttpServletRequest request){lock();Mailbox box=auth.current(request);return saveDraft(fresh(box),body,box,true);}
  @PutMapping("/drafts/{id}") @Transactional public WebmailMessage edit(@PathVariable String id,@RequestBody Map<String,Object> body,HttpServletRequest request){lock();Mailbox box=auth.current(request);WebmailMessage message=owned(id,box);if(!message.folder.equals("Drafts"))throw bad("Only drafts can be edited.");message.deliveryStatus="DRAFT";message.deliveryError="";return saveDraft(message,body,box,false);}
  String localTargets(String value){List<String> result=new ArrayList<>();for(String email:addresses(value)){
    String local=email.substring(0,email.indexOf('@'));String target=aliases.findAll().stream().filter(a->a.alias.equals(local)).map(a->a.target).findFirst().orElse(local);
    Mailbox recipient=boxes.findAll().stream().filter(b->b.address.equals(target)&&b.active).findFirst().orElseThrow(()->bad("Recipient mailbox does not exist or is suspended: "+email));result.add(auth.email(recipient));
    }return String.join(", ",new LinkedHashSet<>(result));}
  @PostMapping("/send") @Transactional public ResponseEntity<?> send(@RequestBody Map<String,Object> body,HttpServletRequest request){
    lock();Mailbox box=auth.current(request);boolean isNew=!(body.get("id") instanceof String id)||((String)body.get("id")).isBlank();
    WebmailMessage message=isNew?fresh(box):owned((String)body.get("id"),box);
    if(!message.folder.equals("Drafts"))throw bad("This draft was already sent or moved.");
    saveDraft(message,body,box,isNew);return dispatch(message,box);
  }
  ResponseEntity<?> dispatch(WebmailMessage message,Mailbox box){List<String> all=new ArrayList<>(addresses(message.toAddress));all.addAll(addresses(message.ccAddress));if(all.isEmpty())throw bad("Enter a recipient.");
    if(!providerEnabled()&&!localMailEnabled)throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE,"Mail delivery provider is not configured.");
    boolean local=!providerEnabled()&&localMailEnabled&&all.stream().allMatch(address->address.endsWith("@"+auth.domain()));
    if(!providerEnabled()&&!local&&all.stream().anyMatch(address->address.endsWith("@"+auth.domain())))throw bad("Send local and external recipients in separate messages.");
    String to=local?localTargets(message.toAddress):message.toAddress,cc=local?localTargets(message.ccAddress):message.ccAddress;
    List<WebmailAttachment> mailFiles=attachments.findByMessageId(message.id);
    try{
      if(local)bridge.send(auth.email(box),to,cc,message.subject,message.body,mailFiles);
      else message.fromAddress=sendExternal(box,message,to,cc,mailFiles);
      message.scheduledAt=null;message.folder="Sent";message.originalFolder="Sent";message.deliveryStatus=message.providerMessageId!=null?"ACCEPTED":message.gmailMessageId!=null?"GMAIL_ACCEPTED":"SMTP_ACCEPTED";message.deliveryError="";message.seen=true;message.createdAt=Instant.now();message.updatedAt=message.createdAt;
      return ResponseEntity.ok(files.view(messages.save(message)));
    }catch(ResponseStatusException error){
      message.deliveryStatus="FAILED";message.deliveryError=error.getReason()==null?"SMTP could not confirm sending.":error.getReason();message.updatedAt=Instant.now();messages.save(message);
      return ResponseEntity.status(error.getStatusCode()).body(Map.of("message",message.deliveryError,"deliveryStatus","FAILED","draftId",message.id));
    }
  }
  @PatchMapping("/messages/{id}") @Transactional public WebmailMessage update(@PathVariable String id,@RequestBody Map<String,Object> body,HttpServletRequest request){
    lock();WebmailMessage message=owned(id,auth.current(request));
    if(body.containsKey("seen")){if(!(body.get("seen") instanceof Boolean))throw bad("seen must be boolean.");message.seen=(Boolean)body.get("seen");}
    if(body.containsKey("starred")){if(!(body.get("starred") instanceof Boolean))throw bad("starred must be boolean.");message.starred=(Boolean)body.get("starred");}
    if(body.containsKey("tag")){String tag=text(body,"tag",20);if(!Set.of("","Red","Orange","Yellow","Green","Blue","Purple","Pink").contains(tag))throw bad("Invalid tag.");message.tag=tag;}
    if(body.containsKey("folder")){
      String target=text(body,"folder",20);
      if(target.equals("Restore")){if(!message.folder.equals("Trash"))throw bad("Only trash messages can be restored.");target=message.originalFolder;}
      else if(target.equals("Trash")){if(!message.folder.equals("Trash"))message.originalFolder=message.folder.equals("Scheduled")?"Drafts":message.folder;message.scheduledAt=null;}
      else if(target.equals("Archive")){if(Set.of("Drafts","Scheduled","Trash").contains(message.folder))throw bad("Only sent or received messages can be archived.");}
      else if(!Set.of("Inbox","Spam").contains(target)||message.sourceKey==null)throw bad("Invalid folder change.");
      message.folder=target;
    }
    message.updatedAt=Instant.now();return files.view(messages.save(message));
  }
  @DeleteMapping("/messages/{id}") @ResponseStatus(HttpStatus.NO_CONTENT) @Transactional public void delete(@PathVariable String id,HttpServletRequest request){lock();WebmailMessage message=owned(id,auth.current(request));if(!message.folder.equals("Trash"))throw bad("Move the message to Trash before deleting permanently.");if(message.sourceKey!=null){WebmailDeletedCapture marker=new WebmailDeletedCapture();marker.id=message.sourceKey;marker.ownerId=message.ownerId;deleted.save(marker);}messages.delete(message);}
  @PostMapping("/schedule") @Transactional public WebmailMessage schedule(@RequestBody Map<String,Object> body,HttpServletRequest request){lock();Mailbox box=auth.current(request);WebmailMessage m=owned(text(body,"id",255),box);if(!m.folder.equals("Drafts"))throw bad("Only drafts can be scheduled.");Instant at;try{at=Instant.parse(text(body,"scheduledAt",40));}catch(Exception e){throw bad("Invalid scheduled time.");}if(!at.isAfter(Instant.now())||at.isAfter(Instant.now().plusSeconds(31536000)))throw bad("Choose a future time within one year.");if(addresses(m.toAddress).isEmpty()&&addresses(m.ccAddress).isEmpty())throw bad("Enter a recipient.");if(!providerEnabled()){localTargets(m.toAddress);localTargets(m.ccAddress);}m.folder="Scheduled";m.scheduledAt=at;m.deliveryStatus="SCHEDULED";return files.view(messages.save(m));}
  @PostMapping("/schedule/{id}/cancel") @Transactional public WebmailMessage cancel(@PathVariable String id,HttpServletRequest request){lock();WebmailMessage m=owned(id,auth.current(request));if(!m.folder.equals("Scheduled"))throw bad("Message is not scheduled.");m.folder="Drafts";m.scheduledAt=null;m.deliveryStatus="DRAFT";return files.view(messages.save(m));}
  @Transactional public void processScheduled(String id){lock();WebmailMessage m=messages.findById(id).orElse(null);if(m==null||!m.folder.equals("Scheduled")||m.scheduledAt==null||m.scheduledAt.isAfter(Instant.now()))return;Mailbox box=boxes.findById(m.ownerId).orElse(null);m.folder="Drafts";m.scheduledAt=null;try{if(box==null||!box.active)throw bad("Sender mailbox is suspended.");dispatch(m,box);}catch(ResponseStatusException e){m.deliveryStatus="FAILED";m.deliveryError=e.getReason();messages.save(m);}}
  @PostMapping("/bulk") @Transactional public Map<String,Object> bulk(@RequestBody Map<String,Object> body,HttpServletRequest request){lock();Mailbox box=auth.current(request);if(!(body.get("ids") instanceof List<?> selectedIds)||selectedIds.isEmpty()||selectedIds.size()>200||selectedIds.stream().anyMatch(id->!(id instanceof String)))throw bad("Select 1–200 messages.");List<String> ids=((List<?>)body.get("ids")).stream().map(Object::toString).distinct().toList();for(String id:ids)owned(id,box);String action=text(body,"action",20);if(!Set.of("read","unread","archive","trash","restore","delete").contains(action))throw bad("Invalid bulk action.");for(String id:ids){if(action.equals("delete"))delete(id,request);else update(id,action.equals("read")||action.equals("unread")?Map.of("seen",action.equals("read")):Map.of("folder",Map.of("archive","Archive","trash","Trash","restore","Restore").get(action)),request);}return Map.of("updated",ids.size());}
  @GetMapping("/messages/{id}/attachments/{fileId}") @Transactional(readOnly=true) public ResponseEntity<byte[]> download(@PathVariable String id,@PathVariable String fileId,HttpServletRequest request){
    owned(id,auth.current(request));WebmailAttachment file=attachments.findById(fileId).filter(value->value.messageId.equals(id)).orElseThrow(()->new ResponseStatusException(HttpStatus.NOT_FOUND,"Attachment not found"));
    return ResponseEntity.ok().cacheControl(CacheControl.noStore()).contentType(MediaType.APPLICATION_OCTET_STREAM).header(HttpHeaders.CONTENT_DISPOSITION,ContentDisposition.attachment().filename(file.filename,java.nio.charset.StandardCharsets.UTF_8).build().toString()).body(file.data);
  }
}