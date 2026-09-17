-- ACL TABLES

CREATE TABLE IF NOT EXISTS inv_fund_acl_user (
    fund_id               BIGINT NOT NULL REFERENCES inv_fund(id) ON DELETE CASCADE,
    organization_id       UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    user_id               UUID NOT NULL,
    perm                  permission_level NOT NULL,
    created_at            TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (fund_id, user_id),
    CONSTRAINT inv_fund_acl_user_org_fk FOREIGN KEY (organization_id, user_id) REFERENCES users(organization_id, id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS inv_fund_acl_group (
    fund_id               BIGINT NOT NULL REFERENCES inv_fund(id) ON DELETE CASCADE,
    organization_id       UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    group_id              BIGINT NOT NULL,
    perm                  permission_level NOT NULL,
    created_at            TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (fund_id, group_id),
    CONSTRAINT inv_fund_acl_group_org_fk FOREIGN KEY (organization_id, group_id) REFERENCES groups(organization_id, id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS inv_company_acl_user (
    company_id            BIGINT NOT NULL REFERENCES inv_company(id) ON DELETE CASCADE,
    organization_id       UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    user_id               UUID NOT NULL,
    perm                  permission_level NOT NULL,
    created_at            TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (company_id, user_id),
    CONSTRAINT inv_company_acl_user_org_fk FOREIGN KEY (organization_id, user_id) REFERENCES users(organization_id, id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS inv_company_acl_group (
    company_id            BIGINT NOT NULL REFERENCES inv_company(id) ON DELETE CASCADE,
    organization_id       UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    group_id              BIGINT NOT NULL,
    perm                  permission_level NOT NULL,
    created_at            TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (company_id, group_id),
    CONSTRAINT inv_company_acl_group_org_fk FOREIGN KEY (organization_id, group_id) REFERENCES groups(organization_id, id) ON DELETE CASCADE
);
