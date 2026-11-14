# Architecture Design

1. Auth Layer:

The Project used Better Auth with 4 Auth Options

- Google OAuth
- Github OAuth
- Twitch OAuth (configure TWITCH_CLIENT_ID/SECRET to enable)
- Email & OTP Code Logi

```mermaid.js
erDiagram
    user ||--o{ session : "has many (cascade)"
    user ||--o{ account : "has many (cascade)"

    user {
        text id PK
        text name
        text email UK
        boolean email_verified
        text image
        timestamp created_at
        timestamp updated_at
    }

    session {
        text id PK
        timestamp expires_at
        text token UK
        timestamp created_at
        timestamp updated_at
        text ip_address
        text user_agent
        text user_id FK "Indexed (session_userId_idx)"
    }

    account {
        text id PK
        text account_id
        text provider_id "google | github | twitch | credential"
        text user_id FK "Indexed (account_userId_idx)"
        text access_token
        text refresh_token
        text id_token
        timestamp access_token_expires_at
        timestamp refresh_token_expires_at
        text scope
        text password
        timestamp created_at
        timestamp updated_at
    }

    verification {
        text id PK
        text identifier "Indexed (verification_identifier_idx)"
        text value "OTP / Verification Token"
        timestamp expires_at
        timestamp created_at
        timestamp updated_at
    }

    jwks {
        text id PK
        text public_key
        text private_key
        timestamp created_at
        timestamp expires_at
        text alg
        text crv
    }

```


```mermaid.js
flowchart TB
    subgraph Client ["Client App"]
        UI["Web / Mobile Client"]
    end

    subgraph AuthLayer ["Auth Layer (Better Auth)"]
        Router["Auth Endpoints<br/>(/sign-in, /callback, /verify-email, /token, /jwks)"]
        SessionMgr["Session & Token Manager"]
        JWTIssuer["JWT Signer & JWKS Endpoint"]
    end

    subgraph External ["External Services"]
        OAuth["OAuth Providers<br/>(Google, GitHub, Twitch)"]
        Mailer["Email Service<br/>(OTP Delivery)"]
    end

    subgraph Postgres ["PostgreSQL (Drizzle ORM)"]
        UserTbl[("user<br/>(Profile & emailVerified)")]
        AccountTbl[("account<br/>(OAuth Tokens & Hashed Password)")]
        SessionTbl[("session<br/>(Session Token, IP, UserAgent)")]
        VerifyTbl[("verification<br/>(Email OTP Codes)")]
        JwksTbl[("jwks<br/>(Public / Private Signing Keys)")]
    end

    subgraph Downstream ["Protected Services"]
        API["Resource APIs<br/>(Verifies JWT via Public JWKS)"]
    end

    %% Flows
    UI -->|"1. Email/Pass or OAuth"| Router
    Router <-->|"OAuth 2.0 Code Exchange"| OAuth
    Router <-->|"Read/Write Credentials & Tokens"| AccountTbl
    Router <-->|"Upsert Profile"| UserTbl

    %% Email OTP
    Router -->|"2. Create OTP"| VerifyTbl
    Router -.->|"Send OTP"| Mailer
    UI -->|"3. Submit OTP"| Router
    Router -->|"Verify & Set emailVerified=true"| UserTbl

    %% Session & JWT
    Router --> SessionMgr
    SessionMgr -->|"4. Store Active Session"| SessionTbl
    SessionMgr --> JWTIssuer
    JWTIssuer <-->|"Sign JWT (private_key)"| JwksTbl
    JWTIssuer -->|"5. Issue Session Cookie + JWT"| UI

    %% API Verification
    UI -->|"6. Request + Bearer JWT"| API
    API -.->|"Fetch public_key (/jwks)"| JWTIssuer

```