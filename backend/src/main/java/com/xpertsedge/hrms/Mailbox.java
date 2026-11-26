package com.xpertsedge.hrms;
import com.fasterxml.jackson.annotation.JsonIgnore;
import jakarta.persistence.*;
@Entity
public class Mailbox { @Column(nullable=false) public java.time.Instant createdAt=java.time.Instant.now(); @Id @GeneratedValue public Long id; @Column(unique = true) public String address; public String displayName;
  /** Role provisioned for the HRMS account created with this mailbox. */
  @Column(nullable=false,length=20) public String accessRole = "EMPLOYEE";
  public int quotaGb = 2; public double usedGb = 0; public boolean active = true; @JsonIgnore public String passwordHash; }
