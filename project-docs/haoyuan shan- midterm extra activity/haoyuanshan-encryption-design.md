# Encryption Design Document (Student Version)

## 1. Background
Our system has user data, deletion requests, and proof-related information.
If these data are not protected during transfer or storage, they may be exposed or modified.
So we need a simple and practical encryption design.

## 2. Design Goals
This design aims to do the following:
- Keep data safe during network transmission
- Encrypt important fields before storage
- Avoid hardcoding sensitive config (keys, passwords) in code
- Support troubleshooting without exposing plaintext

## 3. Protection Scope
We mainly protect these data types:
- User identity fields (such as email and subjectId)
- Sensitive fields in deletion requests
- Important messages passed between services
- Sensitive content in database and cache

Out of scope for this round:
- Long-term key management in browser local storage
- Building our own encryption algorithm

## 4. Threat Model (Simple Version)
We assume these risks may happen:
- Network sniffing can read request content
- Database leak can expose plaintext data
- Developers may accidentally commit keys to repository
- Service-to-service calls may be forged or tampered

## 5. Solution Overview
We use a three-layer design: transport encryption + storage encryption + key management.

1. Transport encryption:
- Use HTTPS/TLS for external and inter-service communication when possible.
- Avoid plain HTTP even in internal network.

2. Storage encryption:
- Encrypt sensitive fields at application level before saving to database.
- Recommended algorithm: AES-256-GCM (common, fast, and has integrity check).

3. Key management:
- Put master key in environment variables or Kubernetes Secret.
- Do not hardcode fixed keys in source code.
- Manage keys by version and support rotation.

## 6. Field Encryption Design
### 6.1 Fields to encrypt
Suggested fields:
- subjectId
- email (if needed by business logic)
- sensitive text in notes/comments

### 6.2 Ciphertext format
For each encrypted value, store:
- keyVersion: key version
- iv: random initialization vector
- ciphertext: encrypted payload
- tag: authentication tag (GCM)

This makes future key rotation easier because we can decrypt by version.

### 6.3 Encryption flow
1. Business code receives plaintext.
2. Generate random iv.
3. Encrypt using AES-256-GCM with current key version.
4. Save keyVersion, iv, ciphertext, and tag.

### 6.4 Decryption flow
1. Read keyVersion.
2. Get the matching key from key manager.
3. Decrypt with iv, ciphertext, and tag.
4. If decryption fails, return error and write security log.

## 7. Inter-Service Message Protection
For event messages (for example RabbitMQ), we suggest:
- Enable TLS on transport layer (if environment supports it)
- Encrypt sensitive fields inside message payload
- Add message signature or integrity check to prevent tampering

## 8. Key Management and Rotation
### 8.1 Key storage
- Development environment: local .env (never commit to git)
- Cloud environment: Kubernetes Secret

### 8.2 Rotation process
- Add a new key version (for example v2)
- Use v2 for all new writes
- Re-encrypt old data gradually when needed
- Retire old key after system becomes stable

### 8.3 Access control
- Only backend service accounts can read keys
- Ops and developers follow least-privilege access

## 9. Logging and Monitoring Requirements
- Do not print plaintext sensitive data in logs
- Record encryption/decryption failure count
- Trigger alert on unusual failure spikes (possible attack or config issue)

## 10. Test Plan
We use three types of tests:

1. Unit tests:
- Normal encrypt/decrypt flow
- Key version mismatch
- Wrong tag should fail decryption

2. Integration tests:
- Encrypt before writing to DB, then read and decrypt
- Verify encrypted fields in service-to-service messages are handled correctly

3. Security checks:
- Scan code for hardcoded keys
- Check logs for plaintext leakage

## 11. Expected Results
After implementation, we expect:
- Core plaintext is not visible in packet capture
- Sensitive fields are unreadable from leaked database directly
- Keys are manageable and rotatable
- Overall security is clearly improved

## 12. Design Limitations
- Adds some development and maintenance cost
- Querying encrypted fields is less convenient than plaintext fields
- Requires team-wide standards, otherwise encryption may be missed

## 13. Summary
This is not the most complex security architecture, but it is practical for a course project.
The main idea is to block key risks first and keep room for future upgrades.
For a student project, this layered approach is easier to implement and easier to explain in presentation.
