export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never;
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      graphql: {
        Args: {
          extensions?: Json;
          operationName?: string;
          query?: string;
          variables?: Json;
        };
        Returns: Json;
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
  public: {
    Tables: {
      activities: {
        Row: {
          activity_data: Json | null;
          activity_type: string | null;
          contract_id: number | null;
          created_at: string | null;
          entity_id: number | null;
          id: number;
          module_type: string;
          user_id: string | null;
        };
        Insert: {
          activity_data?: Json | null;
          activity_type?: string | null;
          contract_id?: number | null;
          created_at?: string | null;
          entity_id?: number | null;
          id?: number;
          module_type?: string;
          user_id?: string | null;
        };
        Update: {
          activity_data?: Json | null;
          activity_type?: string | null;
          contract_id?: number | null;
          created_at?: string | null;
          entity_id?: number | null;
          id?: number;
          module_type?: string;
          user_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'activities_contract_id_fkey';
            columns: ['contract_id'];
            isOneToOne: false;
            referencedRelation: 'contracts';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'activities_entity_id_fkey';
            columns: ['entity_id'];
            isOneToOne: false;
            referencedRelation: 'module_entities';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'activities_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
        ];
      };
      admin_org_metrics_monthly: {
        Row: {
          computed_at: string;
          cpm_active_vendors: number;
          cpm_tcv: number;
          cpm_total_contracts: number;
          inv_fmv: number;
          inv_portfolio_companies: number;
          inv_total_documents: number;
          inv_total_invested: number;
          is_demo_org: boolean;
          month_start: string;
          organization_id: string;
          organization_name: string | null;
        };
        Insert: {
          computed_at?: string;
          cpm_active_vendors?: number;
          cpm_tcv?: number;
          cpm_total_contracts?: number;
          inv_fmv?: number;
          inv_portfolio_companies?: number;
          inv_total_documents?: number;
          inv_total_invested?: number;
          is_demo_org?: boolean;
          month_start: string;
          organization_id: string;
          organization_name?: string | null;
        };
        Update: {
          computed_at?: string;
          cpm_active_vendors?: number;
          cpm_tcv?: number;
          cpm_total_contracts?: number;
          inv_fmv?: number;
          inv_portfolio_companies?: number;
          inv_total_documents?: number;
          inv_total_invested?: number;
          is_demo_org?: boolean;
          month_start?: string;
          organization_id?: string;
          organization_name?: string | null;
        };
        Relationships: [];
      };
      app_invites: {
        Row: {
          expired: boolean;
          expires_at: string | null;
          id: number;
          invited_at: string;
          organization_id: string | null;
          token: string | null;
          user_id: string | null;
        };
        Insert: {
          expired?: boolean;
          expires_at?: string | null;
          id?: number;
          invited_at?: string;
          organization_id?: string | null;
          token?: string | null;
          user_id?: string | null;
        };
        Update: {
          expired?: boolean;
          expires_at?: string | null;
          id?: number;
          invited_at?: string;
          organization_id?: string | null;
          token?: string | null;
          user_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'app_invites_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'mcp_distinct_orgs';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'app_invites_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'app_invites_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
        ];
      };
      app_modules: {
        Row: {
          base_path: string;
          code: string;
          created_at: string | null;
          description: string | null;
          id: number;
          is_active: boolean | null;
          name: string;
          updated_at: string | null;
        };
        Insert: {
          base_path: string;
          code: string;
          created_at?: string | null;
          description?: string | null;
          id?: number;
          is_active?: boolean | null;
          name: string;
          updated_at?: string | null;
        };
        Update: {
          base_path?: string;
          code?: string;
          created_at?: string | null;
          description?: string | null;
          id?: number;
          is_active?: boolean | null;
          name?: string;
          updated_at?: string | null;
        };
        Relationships: [];
      };
      asset_classes: {
        Row: {
          id: number;
          name: string;
        };
        Insert: {
          id?: number;
          name: string;
        };
        Update: {
          id?: number;
          name?: string;
        };
        Relationships: [];
      };
      audit_log: {
        Row: {
          action: string;
          id: number;
          ip_address: unknown;
          metadata: Json | null;
          new_data: Json | null;
          old_data: Json | null;
          organization_id: string | null;
          resource_id: string | null;
          resource_type: string;
          session_id: string | null;
          timestamp: string;
          user_agent: string | null;
          user_id: string | null;
        };
        Insert: {
          action: string;
          id?: number;
          ip_address?: unknown;
          metadata?: Json | null;
          new_data?: Json | null;
          old_data?: Json | null;
          organization_id?: string | null;
          resource_id?: string | null;
          resource_type: string;
          session_id?: string | null;
          timestamp?: string;
          user_agent?: string | null;
          user_id?: string | null;
        };
        Update: {
          action?: string;
          id?: number;
          ip_address?: unknown;
          metadata?: Json | null;
          new_data?: Json | null;
          old_data?: Json | null;
          organization_id?: string | null;
          resource_id?: string | null;
          resource_type?: string;
          session_id?: string | null;
          timestamp?: string;
          user_agent?: string | null;
          user_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'audit_log_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'mcp_distinct_orgs';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'audit_log_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
        ];
      };
      bloomberg_firmwide_accounts: {
        Row: {
          created_at: string;
          firmwide_id: number;
          id: number;
          organization_id: string;
          vendor_id: number;
        };
        Insert: {
          created_at?: string;
          firmwide_id: number;
          id?: never;
          organization_id: string;
          vendor_id: number;
        };
        Update: {
          created_at?: string;
          firmwide_id?: number;
          id?: never;
          organization_id?: string;
          vendor_id?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'bloomberg_firmwide_accounts_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'mcp_distinct_orgs';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'bloomberg_firmwide_accounts_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'bloomberg_firmwide_accounts_vendor_id_fkey';
            columns: ['vendor_id'];
            isOneToOne: false;
            referencedRelation: 'vendors';
            referencedColumns: ['id'];
          },
        ];
      };
      bloomberg_sid_accounts: {
        Row: {
          auto: number;
          city: string;
          country: string;
          currency_code: string;
          cust_num: number;
          firmwide_id: number;
          id: number;
          name: string;
          organization_id: string;
          report_id: number;
          state: string | null;
          tax_rate: number;
          term: number;
        };
        Insert: {
          auto: number;
          city: string;
          country: string;
          currency_code: string;
          cust_num: number;
          firmwide_id: number;
          id?: never;
          name: string;
          organization_id: string;
          report_id: number;
          state?: string | null;
          tax_rate: number;
          term: number;
        };
        Update: {
          auto?: number;
          city?: string;
          country?: string;
          currency_code?: string;
          cust_num?: number;
          firmwide_id?: number;
          id?: never;
          name?: string;
          organization_id?: string;
          report_id?: number;
          state?: string | null;
          tax_rate?: number;
          term?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'bloomberg_sid_accounts_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'mcp_distinct_orgs';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'bloomberg_sid_accounts_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'bloomberg_sid_accounts_report_fkey';
            columns: ['organization_id', 'report_id'];
            isOneToOne: false;
            referencedRelation: 'bloomberg_sid_reports';
            referencedColumns: ['organization_id', 'id'];
          },
        ];
      };
      bloomberg_sid_changes: {
        Row: {
          activity_date: string;
          activity_time: string;
          code: number;
          cust_num: number;
          description: string;
          from_completion_date: string | null;
          from_cust_num: number | null;
          hardware_amount: number | null;
          hardware_billthru_date: string | null;
          hardware_related_cust_num: number | null;
          hardware_related_inst_num: number | null;
          hardware_related_sid: number | null;
          id: number;
          is_start: boolean;
          is_stop: boolean;
          line: number;
          order_num: number;
          organization_id: string;
          po_number: string | null;
          report_id: number;
          sid: number;
          sid_inst_num: number;
          special: string | null;
          subscription_amount: number | null;
          subscription_billthru_date: string | null;
          subscription_related_cust_num: number | null;
          subscription_related_inst_num: number | null;
          subscription_related_sid: number | null;
          to_completion_date: string | null;
          to_cust_num: number | null;
          type_description: string;
        };
        Insert: {
          activity_date: string;
          activity_time: string;
          code: number;
          cust_num: number;
          description: string;
          from_completion_date?: string | null;
          from_cust_num?: number | null;
          hardware_amount?: number | null;
          hardware_billthru_date?: string | null;
          hardware_related_cust_num?: number | null;
          hardware_related_inst_num?: number | null;
          hardware_related_sid?: number | null;
          id?: never;
          is_start: boolean;
          is_stop: boolean;
          line: number;
          order_num: number;
          organization_id: string;
          po_number?: string | null;
          report_id: number;
          sid: number;
          sid_inst_num: number;
          special?: string | null;
          subscription_amount?: number | null;
          subscription_billthru_date?: string | null;
          subscription_related_cust_num?: number | null;
          subscription_related_inst_num?: number | null;
          subscription_related_sid?: number | null;
          to_completion_date?: string | null;
          to_cust_num?: number | null;
          type_description: string;
        };
        Update: {
          activity_date?: string;
          activity_time?: string;
          code?: number;
          cust_num?: number;
          description?: string;
          from_completion_date?: string | null;
          from_cust_num?: number | null;
          hardware_amount?: number | null;
          hardware_billthru_date?: string | null;
          hardware_related_cust_num?: number | null;
          hardware_related_inst_num?: number | null;
          hardware_related_sid?: number | null;
          id?: never;
          is_start?: boolean;
          is_stop?: boolean;
          line?: number;
          order_num?: number;
          organization_id?: string;
          po_number?: string | null;
          report_id?: number;
          sid?: number;
          sid_inst_num?: number;
          special?: string | null;
          subscription_amount?: number | null;
          subscription_billthru_date?: string | null;
          subscription_related_cust_num?: number | null;
          subscription_related_inst_num?: number | null;
          subscription_related_sid?: number | null;
          to_completion_date?: string | null;
          to_cust_num?: number | null;
          type_description?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'bloomberg_sid_changes_account_fkey';
            columns: ['report_id', 'cust_num'];
            isOneToOne: false;
            referencedRelation: 'bloomberg_sid_accounts';
            referencedColumns: ['report_id', 'cust_num'];
          },
          {
            foreignKeyName: 'bloomberg_sid_changes_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'mcp_distinct_orgs';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'bloomberg_sid_changes_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'bloomberg_sid_changes_report_fkey';
            columns: ['organization_id', 'report_id'];
            isOneToOne: false;
            referencedRelation: 'bloomberg_sid_reports';
            referencedColumns: ['organization_id', 'id'];
          },
        ];
      };
      bloomberg_sid_exchange_fee_lines: {
        Row: {
          contributor_bills: boolean;
          eid_number: number;
          fee_id: number;
          id: number;
          organization_id: string;
          pro_rate: number | null;
          sid: number;
          sid_inst_num: number;
        };
        Insert: {
          contributor_bills?: boolean;
          eid_number: number;
          fee_id: number;
          id?: never;
          organization_id: string;
          pro_rate?: number | null;
          sid: number;
          sid_inst_num: number;
        };
        Update: {
          contributor_bills?: boolean;
          eid_number?: number;
          fee_id?: number;
          id?: never;
          organization_id?: string;
          pro_rate?: number | null;
          sid?: number;
          sid_inst_num?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'bloomberg_sid_exchange_fee_lines_fee_fkey';
            columns: ['organization_id', 'fee_id'];
            isOneToOne: false;
            referencedRelation: 'bloomberg_sid_exchange_fees';
            referencedColumns: ['organization_id', 'id'];
          },
          {
            foreignKeyName: 'bloomberg_sid_exchange_fee_lines_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'mcp_distinct_orgs';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'bloomberg_sid_exchange_fee_lines_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
        ];
      };
      bloomberg_sid_exchange_fees: {
        Row: {
          contributor_bills: boolean;
          currency_code: string | null;
          cust_num: number;
          exchange_code: string;
          exchange_name: string;
          fee_kind: string;
          id: number;
          organization_id: string;
          report_id: number;
          rpt_month: string;
          subscriptions: number;
          total_price: number | null;
        };
        Insert: {
          contributor_bills?: boolean;
          currency_code?: string | null;
          cust_num: number;
          exchange_code: string;
          exchange_name: string;
          fee_kind: string;
          id?: never;
          organization_id: string;
          report_id: number;
          rpt_month: string;
          subscriptions: number;
          total_price?: number | null;
        };
        Update: {
          contributor_bills?: boolean;
          currency_code?: string | null;
          cust_num?: number;
          exchange_code?: string;
          exchange_name?: string;
          fee_kind?: string;
          id?: never;
          organization_id?: string;
          report_id?: number;
          rpt_month?: string;
          subscriptions?: number;
          total_price?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: 'bloomberg_sid_exchange_fees_account_fkey';
            columns: ['report_id', 'cust_num'];
            isOneToOne: false;
            referencedRelation: 'bloomberg_sid_accounts';
            referencedColumns: ['report_id', 'cust_num'];
          },
          {
            foreignKeyName: 'bloomberg_sid_exchange_fees_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'mcp_distinct_orgs';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'bloomberg_sid_exchange_fees_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'bloomberg_sid_exchange_fees_report_fkey';
            columns: ['organization_id', 'report_id'];
            isOneToOne: false;
            referencedRelation: 'bloomberg_sid_reports';
            referencedColumns: ['organization_id', 'id'];
          },
        ];
      };
      bloomberg_sid_material_charges: {
        Row: {
          currency_code: string | null;
          cust_num: number;
          description: string | null;
          end_date: string | null;
          id: number;
          material: string | null;
          organization_id: string;
          quantity: number | null;
          report_id: number;
          rpt_month: string | null;
          start_date: string | null;
          total_price: number | null;
          username: string | null;
        };
        Insert: {
          currency_code?: string | null;
          cust_num: number;
          description?: string | null;
          end_date?: string | null;
          id?: never;
          material?: string | null;
          organization_id: string;
          quantity?: number | null;
          report_id: number;
          rpt_month?: string | null;
          start_date?: string | null;
          total_price?: number | null;
          username?: string | null;
        };
        Update: {
          currency_code?: string | null;
          cust_num?: number;
          description?: string | null;
          end_date?: string | null;
          id?: never;
          material?: string | null;
          organization_id?: string;
          quantity?: number | null;
          report_id?: number;
          rpt_month?: string | null;
          start_date?: string | null;
          total_price?: number | null;
          username?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'bloomberg_sid_material_charges_account_fkey';
            columns: ['report_id', 'cust_num'];
            isOneToOne: false;
            referencedRelation: 'bloomberg_sid_accounts';
            referencedColumns: ['report_id', 'cust_num'];
          },
          {
            foreignKeyName: 'bloomberg_sid_material_charges_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'mcp_distinct_orgs';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'bloomberg_sid_material_charges_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'bloomberg_sid_material_charges_report_fkey';
            columns: ['organization_id', 'report_id'];
            isOneToOne: false;
            referencedRelation: 'bloomberg_sid_reports';
            referencedColumns: ['organization_id', 'id'];
          },
        ];
      };
      bloomberg_sid_report_files: {
        Row: {
          byte_size: number;
          created_at: string;
          file_index: number;
          file_name: string;
          id: number;
          organization_id: string;
          report_id: number;
          row_count: number;
          sha256: string;
          storage_path: string;
        };
        Insert: {
          byte_size: number;
          created_at?: string;
          file_index: number;
          file_name: string;
          id?: never;
          organization_id: string;
          report_id: number;
          row_count: number;
          sha256: string;
          storage_path: string;
        };
        Update: {
          byte_size?: number;
          created_at?: string;
          file_index?: number;
          file_name?: string;
          id?: never;
          organization_id?: string;
          report_id?: number;
          row_count?: number;
          sha256?: string;
          storage_path?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'bloomberg_sid_report_files_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'mcp_distinct_orgs';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'bloomberg_sid_report_files_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'bloomberg_sid_report_files_report_fkey';
            columns: ['organization_id', 'report_id'];
            isOneToOne: false;
            referencedRelation: 'bloomberg_sid_reports';
            referencedColumns: ['organization_id', 'id'];
          },
        ];
      };
      bloomberg_sid_reports: {
        Row: {
          billing_date: string;
          created_at: string;
          firmwide_id: number;
          id: number;
          imported_by: string | null;
          organization_id: string;
          report_month: string;
        };
        Insert: {
          billing_date: string;
          created_at?: string;
          firmwide_id: number;
          id?: never;
          imported_by?: string | null;
          organization_id: string;
          report_month: string;
        };
        Update: {
          billing_date?: string;
          created_at?: string;
          firmwide_id?: number;
          id?: never;
          imported_by?: string | null;
          organization_id?: string;
          report_month?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'bloomberg_sid_reports_firmwide_account_fkey';
            columns: ['organization_id', 'firmwide_id'];
            isOneToOne: false;
            referencedRelation: 'bloomberg_firmwide_accounts';
            referencedColumns: ['organization_id', 'firmwide_id'];
          },
          {
            foreignKeyName: 'bloomberg_sid_reports_imported_by_fkey';
            columns: ['imported_by'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'bloomberg_sid_reports_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'mcp_distinct_orgs';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'bloomberg_sid_reports_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
        ];
      };
      bloomberg_sid_research_purchases: {
        Row: {
          analyst_name: string | null;
          asset_class: string | null;
          consumer_company_name: string | null;
          consumer_company_number: number | null;
          cust_num: number;
          id: number;
          industry: string | null;
          memo: string | null;
          organization_id: string;
          price_per_document: number | null;
          publish_date: string | null;
          purchaser_name: string | null;
          purchaser_uuid: string | null;
          region: string | null;
          report_id: number;
          research_class_name: string | null;
          research_report_id: string | null;
          rpt_month: string | null;
          title: string | null;
          transaction_date: string | null;
          transaction_id: string | null;
          volume_purchased: number | null;
        };
        Insert: {
          analyst_name?: string | null;
          asset_class?: string | null;
          consumer_company_name?: string | null;
          consumer_company_number?: number | null;
          cust_num: number;
          id?: never;
          industry?: string | null;
          memo?: string | null;
          organization_id: string;
          price_per_document?: number | null;
          publish_date?: string | null;
          purchaser_name?: string | null;
          purchaser_uuid?: string | null;
          region?: string | null;
          report_id: number;
          research_class_name?: string | null;
          research_report_id?: string | null;
          rpt_month?: string | null;
          title?: string | null;
          transaction_date?: string | null;
          transaction_id?: string | null;
          volume_purchased?: number | null;
        };
        Update: {
          analyst_name?: string | null;
          asset_class?: string | null;
          consumer_company_name?: string | null;
          consumer_company_number?: number | null;
          cust_num?: number;
          id?: never;
          industry?: string | null;
          memo?: string | null;
          organization_id?: string;
          price_per_document?: number | null;
          publish_date?: string | null;
          purchaser_name?: string | null;
          purchaser_uuid?: string | null;
          region?: string | null;
          report_id?: number;
          research_class_name?: string | null;
          research_report_id?: string | null;
          rpt_month?: string | null;
          title?: string | null;
          transaction_date?: string | null;
          transaction_id?: string | null;
          volume_purchased?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: 'bloomberg_sid_research_purchases_account_fkey';
            columns: ['report_id', 'cust_num'];
            isOneToOne: false;
            referencedRelation: 'bloomberg_sid_accounts';
            referencedColumns: ['report_id', 'cust_num'];
          },
          {
            foreignKeyName: 'bloomberg_sid_research_purchases_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'mcp_distinct_orgs';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'bloomberg_sid_research_purchases_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'bloomberg_sid_research_purchases_report_fkey';
            columns: ['organization_id', 'report_id'];
            isOneToOne: false;
            referencedRelation: 'bloomberg_sid_reports';
            referencedColumns: ['organization_id', 'id'];
          },
        ];
      };
      bloomberg_sid_subscriptions: {
        Row: {
          contract_date: string;
          cust_num: number;
          dual_cust_num: number | null;
          dual_inst_num: number | null;
          gptt: number;
          gptt_description: string;
          id: number;
          last_user: string;
          ninety_day: boolean;
          organization_id: string;
          po_number: string | null;
          price: number;
          renewal_date: string;
          report_id: number;
          serial_number: string;
          sid: number;
          sid_description: string;
          sid_inst_num: number;
          sid_type: number;
          special: string | null;
          ws: number | null;
        };
        Insert: {
          contract_date: string;
          cust_num: number;
          dual_cust_num?: number | null;
          dual_inst_num?: number | null;
          gptt: number;
          gptt_description: string;
          id?: never;
          last_user: string;
          ninety_day?: boolean;
          organization_id: string;
          po_number?: string | null;
          price: number;
          renewal_date: string;
          report_id: number;
          serial_number: string;
          sid: number;
          sid_description: string;
          sid_inst_num: number;
          sid_type: number;
          special?: string | null;
          ws?: number | null;
        };
        Update: {
          contract_date?: string;
          cust_num?: number;
          dual_cust_num?: number | null;
          dual_inst_num?: number | null;
          gptt?: number;
          gptt_description?: string;
          id?: never;
          last_user?: string;
          ninety_day?: boolean;
          organization_id?: string;
          po_number?: string | null;
          price?: number;
          renewal_date?: string;
          report_id?: number;
          serial_number?: string;
          sid?: number;
          sid_description?: string;
          sid_inst_num?: number;
          sid_type?: number;
          special?: string | null;
          ws?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: 'bloomberg_sid_subscriptions_account_fkey';
            columns: ['report_id', 'cust_num'];
            isOneToOne: false;
            referencedRelation: 'bloomberg_sid_accounts';
            referencedColumns: ['report_id', 'cust_num'];
          },
          {
            foreignKeyName: 'bloomberg_sid_subscriptions_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'mcp_distinct_orgs';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'bloomberg_sid_subscriptions_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'bloomberg_sid_subscriptions_report_fkey';
            columns: ['organization_id', 'report_id'];
            isOneToOne: false;
            referencedRelation: 'bloomberg_sid_reports';
            referencedColumns: ['organization_id', 'id'];
          },
        ];
      };
      chat_messages: {
        Row: {
          content: string;
          created_at: string;
          id: number;
          metadata: Json | null;
          role: string;
          session_id: number;
        };
        Insert: {
          content: string;
          created_at?: string;
          id?: number;
          metadata?: Json | null;
          role: string;
          session_id: number;
        };
        Update: {
          content?: string;
          created_at?: string;
          id?: number;
          metadata?: Json | null;
          role?: string;
          session_id?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'chat_messages_session_id_fkey';
            columns: ['session_id'];
            isOneToOne: false;
            referencedRelation: 'chat_sessions';
            referencedColumns: ['id'];
          },
        ];
      };
      chat_queries_log: {
        Row: {
          created_at: string;
          id: number;
          sanitized_query: string;
        };
        Insert: {
          created_at?: string;
          id?: never;
          sanitized_query: string;
        };
        Update: {
          created_at?: string;
          id?: never;
          sanitized_query?: string;
        };
        Relationships: [];
      };
      chat_sessions: {
        Row: {
          created_at: string;
          id: number;
          organization_id: string;
          title: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          id?: number;
          organization_id: string;
          title?: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: number;
          organization_id?: string;
          title?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'chat_sessions_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'mcp_distinct_orgs';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'chat_sessions_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
        ];
      };
      client_entities: {
        Row: {
          address: string;
          created_at: string | null;
          id: number;
          name: string;
          organization_id: string;
          updated_at: string | null;
        };
        Insert: {
          address: string;
          created_at?: string | null;
          id?: number;
          name: string;
          organization_id: string;
          updated_at?: string | null;
        };
        Update: {
          address?: string;
          created_at?: string | null;
          id?: number;
          name?: string;
          organization_id?: string;
          updated_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'client_entities_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'mcp_distinct_orgs';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'client_entities_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
        ];
      };
      companies: {
        Row: {
          address: string | null;
          created_at: string | null;
          description: string | null;
          domain: string | null;
          email: string | null;
          founded_year: number | null;
          headquarters: string | null;
          id: number;
          industry: string | null;
          legal_jurisdiction: string | null;
          merged_into_company_id: number | null;
          merger_effective_date: string | null;
          name: string;
          phone: string | null;
          status: Database['public']['Enums']['CompanyStatus'] | null;
          updated_at: string | null;
        };
        Insert: {
          address?: string | null;
          created_at?: string | null;
          description?: string | null;
          domain?: string | null;
          email?: string | null;
          founded_year?: number | null;
          headquarters?: string | null;
          id?: number;
          industry?: string | null;
          legal_jurisdiction?: string | null;
          merged_into_company_id?: number | null;
          merger_effective_date?: string | null;
          name: string;
          phone?: string | null;
          status?: Database['public']['Enums']['CompanyStatus'] | null;
          updated_at?: string | null;
        };
        Update: {
          address?: string | null;
          created_at?: string | null;
          description?: string | null;
          domain?: string | null;
          email?: string | null;
          founded_year?: number | null;
          headquarters?: string | null;
          id?: number;
          industry?: string | null;
          legal_jurisdiction?: string | null;
          merged_into_company_id?: number | null;
          merger_effective_date?: string | null;
          name?: string;
          phone?: string | null;
          status?: Database['public']['Enums']['CompanyStatus'] | null;
          updated_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'companies_merged_into_company_id_fkey';
            columns: ['merged_into_company_id'];
            isOneToOne: false;
            referencedRelation: 'companies';
            referencedColumns: ['id'];
          },
        ];
      };
      contract_acl_group: {
        Row: {
          contract_id: number;
          created_at: string | null;
          group_id: number;
          organization_id: string;
          perm: Database['public']['Enums']['permission_level'];
        };
        Insert: {
          contract_id: number;
          created_at?: string | null;
          group_id: number;
          organization_id: string;
          perm: Database['public']['Enums']['permission_level'];
        };
        Update: {
          contract_id?: number;
          created_at?: string | null;
          group_id?: number;
          organization_id?: string;
          perm?: Database['public']['Enums']['permission_level'];
        };
        Relationships: [
          {
            foreignKeyName: 'contract_acl_group_contract_id_fkey';
            columns: ['contract_id'];
            isOneToOne: false;
            referencedRelation: 'contracts';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'contract_acl_group_org_group_fkey';
            columns: ['organization_id', 'group_id'];
            isOneToOne: false;
            referencedRelation: 'groups';
            referencedColumns: ['organization_id', 'id'];
          },
          {
            foreignKeyName: 'contract_acl_group_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'mcp_distinct_orgs';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'contract_acl_group_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
        ];
      };
      contract_acl_user: {
        Row: {
          contract_id: number;
          created_at: string | null;
          organization_id: string;
          perm: Database['public']['Enums']['permission_level'];
          user_id: string;
        };
        Insert: {
          contract_id: number;
          created_at?: string | null;
          organization_id: string;
          perm: Database['public']['Enums']['permission_level'];
          user_id: string;
        };
        Update: {
          contract_id?: number;
          created_at?: string | null;
          organization_id?: string;
          perm?: Database['public']['Enums']['permission_level'];
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'contract_acl_user_contract_id_fkey';
            columns: ['contract_id'];
            isOneToOne: false;
            referencedRelation: 'contracts';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'contract_acl_user_org_user_fkey';
            columns: ['organization_id', 'user_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['organization_id', 'id'];
          },
          {
            foreignKeyName: 'contract_acl_user_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'mcp_distinct_orgs';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'contract_acl_user_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
        ];
      };
      contract_asset_classes: {
        Row: {
          asset_class_id: number;
          contract_id: number;
          id: number;
          is_parent_tag: boolean;
          sub_asset_class_id: number | null;
        };
        Insert: {
          asset_class_id: number;
          contract_id: number;
          id?: number;
          is_parent_tag?: boolean;
          sub_asset_class_id?: number | null;
        };
        Update: {
          asset_class_id?: number;
          contract_id?: number;
          id?: number;
          is_parent_tag?: boolean;
          sub_asset_class_id?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: 'contract_asset_class_asset_class_id_fkey';
            columns: ['asset_class_id'];
            isOneToOne: false;
            referencedRelation: 'asset_classes';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'contract_asset_class_contract_id_fkey';
            columns: ['contract_id'];
            isOneToOne: false;
            referencedRelation: 'contracts';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'contract_asset_class_sub_asset_class_id_fkey';
            columns: ['sub_asset_class_id'];
            isOneToOne: false;
            referencedRelation: 'sub_asset_classes';
            referencedColumns: ['id'];
          },
        ];
      };
      contract_citations: {
        Row: {
          ai_citation_text: Json | null;
          citation_text: Json | null;
          contract_id: number;
          created_at: string;
          id: number;
          locked_by: string | null;
          locked_by_email: string | null;
          ocr_blocks: Json | null;
          organization_id: string | null;
          status_id: number | null;
          updated_at: string | null;
          user_id: string | null;
        };
        Insert: {
          ai_citation_text?: Json | null;
          citation_text?: Json | null;
          contract_id: number;
          created_at?: string;
          id?: number;
          locked_by?: string | null;
          locked_by_email?: string | null;
          ocr_blocks?: Json | null;
          organization_id?: string | null;
          status_id?: number | null;
          updated_at?: string | null;
          user_id?: string | null;
        };
        Update: {
          ai_citation_text?: Json | null;
          citation_text?: Json | null;
          contract_id?: number;
          created_at?: string;
          id?: number;
          locked_by?: string | null;
          locked_by_email?: string | null;
          ocr_blocks?: Json | null;
          organization_id?: string | null;
          status_id?: number | null;
          updated_at?: string | null;
          user_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'contract_citations_contract_id_fkey';
            columns: ['contract_id'];
            isOneToOne: true;
            referencedRelation: 'contracts';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'contract_citations_locked_by_fkey';
            columns: ['locked_by'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'contract_citations_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'mcp_distinct_orgs';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'contract_citations_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'contract_citations_status_id_fkey';
            columns: ['status_id'];
            isOneToOne: false;
            referencedRelation: 'contract_statuses';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'contract_citations_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
        ];
      };
      contract_comments: {
        Row: {
          content: Json | null;
          contract_id: number;
          created_at: string;
          id: number;
          is_deleted: boolean;
          parent_comment_id: number | null;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          content?: Json | null;
          contract_id: number;
          created_at?: string;
          id?: number;
          is_deleted?: boolean;
          parent_comment_id?: number | null;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          content?: Json | null;
          contract_id?: number;
          created_at?: string;
          id?: number;
          is_deleted?: boolean;
          parent_comment_id?: number | null;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'contract_comments_contract_id_fkey';
            columns: ['contract_id'];
            isOneToOne: false;
            referencedRelation: 'contracts';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'contract_comments_parent_comment_id_fkey';
            columns: ['parent_comment_id'];
            isOneToOne: false;
            referencedRelation: 'contract_comments';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'contract_comments_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
        ];
      };
      contract_comments_attachments: {
        Row: {
          comment_id: number | null;
          contract_id: number | null;
          created_at: string | null;
          file_name: string;
          file_path: string;
          file_size: number;
          file_type: string;
          id: number;
          organization_id: string | null;
          user_id: string;
        };
        Insert: {
          comment_id?: number | null;
          contract_id?: number | null;
          created_at?: string | null;
          file_name: string;
          file_path: string;
          file_size: number;
          file_type: string;
          id?: number;
          organization_id?: string | null;
          user_id: string;
        };
        Update: {
          comment_id?: number | null;
          contract_id?: number | null;
          created_at?: string | null;
          file_name?: string;
          file_path?: string;
          file_size?: number;
          file_type?: string;
          id?: number;
          organization_id?: string | null;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'contract_comments_attachments_comment_id_fkey';
            columns: ['comment_id'];
            isOneToOne: false;
            referencedRelation: 'contract_comments';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'contract_comments_attachments_contract_id_fkey';
            columns: ['contract_id'];
            isOneToOne: false;
            referencedRelation: 'contracts';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'contract_comments_attachments_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'mcp_distinct_orgs';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'contract_comments_attachments_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'contract_comments_attachments_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
        ];
      };
      contract_comments_views: {
        Row: {
          comment_order: Database['public']['Enums']['comment_order'];
          contract_id: number;
          created_at: string;
          last_viewed_at: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          comment_order?: Database['public']['Enums']['comment_order'];
          contract_id: number;
          created_at?: string;
          last_viewed_at?: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          comment_order?: Database['public']['Enums']['comment_order'];
          contract_id?: number;
          created_at?: string;
          last_viewed_at?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'contract_comments_views_contract_id_fkey';
            columns: ['contract_id'];
            isOneToOne: false;
            referencedRelation: 'contracts';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'contract_comments_views_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
        ];
      };
      contract_cost_allocation_lines: {
        Row: {
          allocation_id: number;
          id: number;
          org_employee_id: number | null;
          org_unit_id: number | null;
          organization_id: string;
          percent: number;
        };
        Insert: {
          allocation_id: number;
          id?: number;
          org_employee_id?: number | null;
          org_unit_id?: number | null;
          organization_id: string;
          percent: number;
        };
        Update: {
          allocation_id?: number;
          id?: number;
          org_employee_id?: number | null;
          org_unit_id?: number | null;
          organization_id?: string;
          percent?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'contract_cost_allocation_lines_allocation_fkey';
            columns: ['organization_id', 'allocation_id'];
            isOneToOne: false;
            referencedRelation: 'contract_cost_allocations';
            referencedColumns: ['organization_id', 'id'];
          },
          {
            foreignKeyName: 'contract_cost_allocation_lines_org_employee_fkey';
            columns: ['organization_id', 'org_employee_id'];
            isOneToOne: false;
            referencedRelation: 'org_employees';
            referencedColumns: ['organization_id', 'id'];
          },
          {
            foreignKeyName: 'contract_cost_allocation_lines_org_unit_fkey';
            columns: ['organization_id', 'org_unit_id'];
            isOneToOne: false;
            referencedRelation: 'org_units';
            referencedColumns: ['organization_id', 'id'];
          },
          {
            foreignKeyName: 'contract_cost_allocation_lines_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'mcp_distinct_orgs';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'contract_cost_allocation_lines_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
        ];
      };
      contract_cost_allocations: {
        Row: {
          contract_id: number;
          created_at: string;
          created_by: string | null;
          id: number;
          mode: string;
          organization_id: string;
          product_id: number | null;
          updated_at: string | null;
          updated_by: string | null;
        };
        Insert: {
          contract_id: number;
          created_at?: string;
          created_by?: string | null;
          id?: number;
          mode: string;
          organization_id: string;
          product_id?: number | null;
          updated_at?: string | null;
          updated_by?: string | null;
        };
        Update: {
          contract_id?: number;
          created_at?: string;
          created_by?: string | null;
          id?: number;
          mode?: string;
          organization_id?: string;
          product_id?: number | null;
          updated_at?: string | null;
          updated_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'contract_cost_allocations_contract_fkey';
            columns: ['organization_id', 'contract_id'];
            isOneToOne: false;
            referencedRelation: 'contracts';
            referencedColumns: ['organization_id', 'id'];
          },
          {
            foreignKeyName: 'contract_cost_allocations_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'contract_cost_allocations_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'mcp_distinct_orgs';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'contract_cost_allocations_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'contract_cost_allocations_product_fkey';
            columns: ['product_id'];
            isOneToOne: false;
            referencedRelation: 'vendor_products';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'contract_cost_allocations_updated_by_fkey';
            columns: ['updated_by'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
        ];
      };
      contract_data_delivery_types: {
        Row: {
          contract_id: number | null;
          created_at: string | null;
          data_delivery_type_id: number | null;
          id: number;
        };
        Insert: {
          contract_id?: number | null;
          created_at?: string | null;
          data_delivery_type_id?: number | null;
          id?: number;
        };
        Update: {
          contract_id?: number | null;
          created_at?: string | null;
          data_delivery_type_id?: number | null;
          id?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'contract_data_delivery_types_contract_id_fkey';
            columns: ['contract_id'];
            isOneToOne: false;
            referencedRelation: 'contracts';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'contract_data_delivery_types_data_delivery_type_id_fkey';
            columns: ['data_delivery_type_id'];
            isOneToOne: false;
            referencedRelation: 'data_delivery_types';
            referencedColumns: ['id'];
          },
        ];
      };
      contract_definitions: {
        Row: {
          created_at: string;
          description: string | null;
          display_name: string;
          id: string;
          is_active: boolean;
          type_key: string;
          ui_layout_config: Json | null;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          description?: string | null;
          display_name: string;
          id?: string;
          is_active?: boolean;
          type_key: string;
          ui_layout_config?: Json | null;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          description?: string | null;
          display_name?: string;
          id?: string;
          is_active?: boolean;
          type_key?: string;
          ui_layout_config?: Json | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      contract_docs: {
        Row: {
          contract_id: number | null;
          created_at: string | null;
          description: string | null;
          docusign_envelope_id: string | null;
          docusign_sent_at: string | null;
          docusign_status: string | null;
          file_path: string | null;
          id: number;
          language: string | null;
          translated_file_path: string | null;
          type: string | null;
          updated_at: string | null;
          user_id: string | null;
        };
        Insert: {
          contract_id?: number | null;
          created_at?: string | null;
          description?: string | null;
          docusign_envelope_id?: string | null;
          docusign_sent_at?: string | null;
          docusign_status?: string | null;
          file_path?: string | null;
          id?: number;
          language?: string | null;
          translated_file_path?: string | null;
          type?: string | null;
          updated_at?: string | null;
          user_id?: string | null;
        };
        Update: {
          contract_id?: number | null;
          created_at?: string | null;
          description?: string | null;
          docusign_envelope_id?: string | null;
          docusign_sent_at?: string | null;
          docusign_status?: string | null;
          file_path?: string | null;
          id?: number;
          language?: string | null;
          translated_file_path?: string | null;
          type?: string | null;
          updated_at?: string | null;
          user_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'contract_docs_contract_id_fkey';
            columns: ['contract_id'];
            isOneToOne: false;
            referencedRelation: 'contracts';
            referencedColumns: ['id'];
          },
        ];
      };
      contract_docs_versions: {
        Row: {
          contract_id: number;
          created_at: string;
          description: string | null;
          file_name: string;
          file_path: string;
          id: number;
          user_id: string;
        };
        Insert: {
          contract_id: number;
          created_at?: string;
          description?: string | null;
          file_name: string;
          file_path: string;
          id?: number;
          user_id: string;
        };
        Update: {
          contract_id?: number;
          created_at?: string;
          description?: string | null;
          file_name?: string;
          file_path?: string;
          id?: number;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'contract_docs_versions_contract_id_fkey';
            columns: ['contract_id'];
            isOneToOne: false;
            referencedRelation: 'contracts';
            referencedColumns: ['id'];
          },
        ];
      };
      contract_lineage_events: {
        Row: {
          action: string;
          created_at: string;
          evidence: Json | null;
          id: number;
          new_contract_id: number;
          old_contract_id: number;
          organization_id: string;
          resolved_at: string | null;
          resolved_by: string | null;
          screened_at: string | null;
          screened_by: string | null;
          source: string;
          status: string;
        };
        Insert: {
          action: string;
          created_at?: string;
          evidence?: Json | null;
          id?: never;
          new_contract_id: number;
          old_contract_id: number;
          organization_id: string;
          resolved_at?: string | null;
          resolved_by?: string | null;
          screened_at?: string | null;
          screened_by?: string | null;
          source: string;
          status?: string;
        };
        Update: {
          action?: string;
          created_at?: string;
          evidence?: Json | null;
          id?: never;
          new_contract_id?: number;
          old_contract_id?: number;
          organization_id?: string;
          resolved_at?: string | null;
          resolved_by?: string | null;
          screened_at?: string | null;
          screened_by?: string | null;
          source?: string;
          status?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'contract_lineage_events_new_contract_id_fkey';
            columns: ['new_contract_id'];
            isOneToOne: false;
            referencedRelation: 'contracts';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'contract_lineage_events_old_contract_id_fkey';
            columns: ['old_contract_id'];
            isOneToOne: false;
            referencedRelation: 'contracts';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'contract_lineage_events_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'mcp_distinct_orgs';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'contract_lineage_events_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'contract_lineage_events_resolved_by_fkey';
            columns: ['resolved_by'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'contract_lineage_events_screened_by_fkey';
            columns: ['screened_by'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
        ];
      };
      contract_owners: {
        Row: {
          contract_id: number;
          created_at: string;
          created_by: string | null;
          id: number;
          label: string | null;
          org_employee_id: number | null;
          org_unit_id: number | null;
          organization_id: string;
          role: string;
          user_id: string | null;
        };
        Insert: {
          contract_id: number;
          created_at?: string;
          created_by?: string | null;
          id?: never;
          label?: string | null;
          org_employee_id?: number | null;
          org_unit_id?: number | null;
          organization_id: string;
          role: string;
          user_id?: string | null;
        };
        Update: {
          contract_id?: number;
          created_at?: string;
          created_by?: string | null;
          id?: never;
          label?: string | null;
          org_employee_id?: number | null;
          org_unit_id?: number | null;
          organization_id?: string;
          role?: string;
          user_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'contract_owners_contract_fkey';
            columns: ['organization_id', 'contract_id'];
            isOneToOne: false;
            referencedRelation: 'contracts';
            referencedColumns: ['organization_id', 'id'];
          },
          {
            foreignKeyName: 'contract_owners_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'contract_owners_org_employee_fkey';
            columns: ['organization_id', 'org_employee_id'];
            isOneToOne: false;
            referencedRelation: 'org_employees';
            referencedColumns: ['organization_id', 'id'];
          },
          {
            foreignKeyName: 'contract_owners_org_unit_fkey';
            columns: ['organization_id', 'org_unit_id'];
            isOneToOne: false;
            referencedRelation: 'org_units';
            referencedColumns: ['organization_id', 'id'];
          },
          {
            foreignKeyName: 'contract_owners_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'mcp_distinct_orgs';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'contract_owners_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'contract_owners_user_fkey';
            columns: ['organization_id', 'user_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['organization_id', 'id'];
          },
        ];
      };
      contract_product_credits: {
        Row: {
          amount: number;
          contract_id: number;
          created_at: string;
          created_by: string | null;
          id: number;
          organization_id: string;
          product_id: number;
          sort_order: number | null;
          updated_at: string;
          year: number;
        };
        Insert: {
          amount: number;
          contract_id: number;
          created_at?: string;
          created_by?: string | null;
          id?: never;
          organization_id: string;
          product_id: number;
          sort_order?: number | null;
          updated_at?: string;
          year: number;
        };
        Update: {
          amount?: number;
          contract_id?: number;
          created_at?: string;
          created_by?: string | null;
          id?: never;
          organization_id?: string;
          product_id?: number;
          sort_order?: number | null;
          updated_at?: string;
          year?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'contract_product_credits_contract_fkey';
            columns: ['organization_id', 'contract_id'];
            isOneToOne: false;
            referencedRelation: 'contracts';
            referencedColumns: ['organization_id', 'id'];
          },
          {
            foreignKeyName: 'contract_product_credits_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'contract_product_credits_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'mcp_distinct_orgs';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'contract_product_credits_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'contract_product_credits_product_fkey';
            columns: ['product_id'];
            isOneToOne: false;
            referencedRelation: 'vendor_products';
            referencedColumns: ['id'];
          },
        ];
      };
      contract_relationships: {
        Row: {
          active: boolean | null;
          child_contract_id: number | null;
          created_at: string | null;
          disabled: boolean | null;
          id: number;
          metadata: Json | null;
          parent_contract_id: number | null;
          relationship_type: string | null;
        };
        Insert: {
          active?: boolean | null;
          child_contract_id?: number | null;
          created_at?: string | null;
          disabled?: boolean | null;
          id?: number;
          metadata?: Json | null;
          parent_contract_id?: number | null;
          relationship_type?: string | null;
        };
        Update: {
          active?: boolean | null;
          child_contract_id?: number | null;
          created_at?: string | null;
          disabled?: boolean | null;
          id?: number;
          metadata?: Json | null;
          parent_contract_id?: number | null;
          relationship_type?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'contract_relationships_child_contract_id_fkey';
            columns: ['child_contract_id'];
            isOneToOne: false;
            referencedRelation: 'contracts';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'contract_relationships_child_contract_id_fkey1';
            columns: ['child_contract_id'];
            isOneToOne: false;
            referencedRelation: 'contracts';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'contract_relationships_parent_contract_id_fkey';
            columns: ['parent_contract_id'];
            isOneToOne: false;
            referencedRelation: 'contracts';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'contract_relationships_parent_contract_id_fkey1';
            columns: ['parent_contract_id'];
            isOneToOne: false;
            referencedRelation: 'contracts';
            referencedColumns: ['id'];
          },
        ];
      };
      contract_statuses: {
        Row: {
          created_at: string;
          description: string | null;
          id: number;
          name: string | null;
        };
        Insert: {
          created_at?: string;
          description?: string | null;
          id?: number;
          name?: string | null;
        };
        Update: {
          created_at?: string;
          description?: string | null;
          id?: number;
          name?: string | null;
        };
        Relationships: [];
      };
      contract_tags: {
        Row: {
          contract_id: number;
          created_at: string | null;
          id: number;
          tag_id: number;
        };
        Insert: {
          contract_id: number;
          created_at?: string | null;
          id?: number;
          tag_id: number;
        };
        Update: {
          contract_id?: number;
          created_at?: string | null;
          id?: number;
          tag_id?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'contract_tags_contract_id_fkey';
            columns: ['contract_id'];
            isOneToOne: false;
            referencedRelation: 'contracts';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'contract_tags_tag_id_fkey';
            columns: ['tag_id'];
            isOneToOne: false;
            referencedRelation: 'user_tags';
            referencedColumns: ['id'];
          },
        ];
      };
      contract_type_fields: {
        Row: {
          contract_definition_id: string;
          created_at: string;
          display_order: number | null;
          id: string;
          is_active_for_this_type: boolean;
          is_required_for_completion: boolean;
          is_required_for_extraction: boolean;
          label_override: string | null;
          master_field_id: string;
          prompt_template_group_id: string | null;
          prompt_template_version_override: string | null;
          ui_component_hint_override: string | null;
          updated_at: string;
        };
        Insert: {
          contract_definition_id: string;
          created_at?: string;
          display_order?: number | null;
          id?: string;
          is_active_for_this_type?: boolean;
          is_required_for_completion?: boolean;
          is_required_for_extraction?: boolean;
          label_override?: string | null;
          master_field_id: string;
          prompt_template_group_id?: string | null;
          prompt_template_version_override?: string | null;
          ui_component_hint_override?: string | null;
          updated_at?: string;
        };
        Update: {
          contract_definition_id?: string;
          created_at?: string;
          display_order?: number | null;
          id?: string;
          is_active_for_this_type?: boolean;
          is_required_for_completion?: boolean;
          is_required_for_extraction?: boolean;
          label_override?: string | null;
          master_field_id?: string;
          prompt_template_group_id?: string | null;
          prompt_template_version_override?: string | null;
          ui_component_hint_override?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'contract_type_fields_contract_definition_id_fkey';
            columns: ['contract_definition_id'];
            isOneToOne: false;
            referencedRelation: 'contract_definitions';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'contract_type_fields_master_field_id_fkey';
            columns: ['master_field_id'];
            isOneToOne: false;
            referencedRelation: 'master_field_definitions';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'contract_type_fields_prompt_template_group_id_fkey';
            columns: ['prompt_template_group_id'];
            isOneToOne: false;
            referencedRelation: 'prompt_template_groups';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'contract_type_fields_prompt_template_version_override_fkey';
            columns: ['prompt_template_version_override'];
            isOneToOne: false;
            referencedRelation: 'prompt_templates';
            referencedColumns: ['id'];
          },
        ];
      };
      contract_types: {
        Row: {
          created_at: string;
          description: string | null;
          id: number;
          name: string | null;
        };
        Insert: {
          created_at?: string;
          description?: string | null;
          id?: number;
          name?: string | null;
        };
        Update: {
          created_at?: string;
          description?: string | null;
          id?: number;
          name?: string | null;
        };
        Relationships: [];
      };
      contract_users: {
        Row: {
          contract_id: number | null;
          cost_center: string | null;
          country: string | null;
          created_at: string;
          department: string | null;
          division: string | null;
          email: string | null;
          employee_id: string | null;
          group_id: number | null;
          id: number;
          leave_date: string | null;
          name: string;
          org_employee_id: number | null;
          product_id: number | null;
          region: string | null;
          released_at: string | null;
          start_date: string | null;
          updated_at: string | null;
        };
        Insert: {
          contract_id?: number | null;
          cost_center?: string | null;
          country?: string | null;
          created_at?: string;
          department?: string | null;
          division?: string | null;
          email?: string | null;
          employee_id?: string | null;
          group_id?: number | null;
          id?: number;
          leave_date?: string | null;
          name: string;
          org_employee_id?: number | null;
          product_id?: number | null;
          region?: string | null;
          released_at?: string | null;
          start_date?: string | null;
          updated_at?: string | null;
        };
        Update: {
          contract_id?: number | null;
          cost_center?: string | null;
          country?: string | null;
          created_at?: string;
          department?: string | null;
          division?: string | null;
          email?: string | null;
          employee_id?: string | null;
          group_id?: number | null;
          id?: number;
          leave_date?: string | null;
          name?: string;
          org_employee_id?: number | null;
          product_id?: number | null;
          region?: string | null;
          released_at?: string | null;
          start_date?: string | null;
          updated_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'contract_users_contract_id_fkey';
            columns: ['contract_id'];
            isOneToOne: false;
            referencedRelation: 'contracts';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'contract_users_group_id_fkey';
            columns: ['group_id'];
            isOneToOne: false;
            referencedRelation: 'groups';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'contract_users_org_employee_id_fkey';
            columns: ['org_employee_id'];
            isOneToOne: false;
            referencedRelation: 'org_employees';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'contract_users_product_id_fkey';
            columns: ['product_id'];
            isOneToOne: false;
            referencedRelation: 'vendor_products';
            referencedColumns: ['id'];
          },
        ];
      };
      contract_versions: {
        Row: {
          activities: string | null;
          actor: string | null;
          ai_extraction: Json | null;
          ai_extraction_status:
            | Database['public']['Enums']['ai_extraction_status']
            | null;
          ai_notes: string | null;
          ai_training_restrictions: string | null;
          ai_validation: Json | null;
          all_parties_signed: string | null;
          annual_increase: number | null;
          annual_increase_months: number | null;
          apply_to_overall_spend: boolean | null;
          arbitration_and_conflict_resolution: string | null;
          audit_requirements: string | null;
          auto_renewal: boolean | null;
          billing_frequency: string | null;
          business_group: string | null;
          business_justification: string | null;
          business_order: string | null;
          business_sponsor: Json | null;
          cancel_by_date: number | null;
          cancel_date: Json | null;
          cancellation_process: string | null;
          changed_data: Json | null;
          client_entity_id: number | null;
          comment: string | null;
          contract_id: number;
          cost_mitigation: string | null;
          created_at: string;
          created_by: string | null;
          currency: string | null;
          data_disposal_tnc: string | null;
          date_of_last_signature: string | null;
          decision_reason: string | null;
          derivative_works: string | null;
          discount: number | null;
          distribution_rights: string | null;
          doc_fully_executed: boolean | null;
          due_date: string | null;
          end_users: string | null;
          exclusivity_terms: string | null;
          execution_date: string | null;
          ext_validation: Json | null;
          external_integration_connection_id: string | null;
          external_invoice_id: string | null;
          external_invoice_status: string | null;
          external_source: string | null;
          folder_id: string | null;
          geo_restrictions: string | null;
          id: number;
          internal_external_users: string | null;
          invoice_status: Database['public']['Enums']['invoice_status'] | null;
          is_duplicate: boolean;
          last_synced_at: string | null;
          legacy_renewal_period: string | null;
          locked_by: string | null;
          locked_by_email: string | null;
          market_data_types: string | null;
          marketing_rights: string | null;
          metadata: Json | null;
          multi_year: boolean | null;
          number_of_users: string | null;
          open_ai_file_id: string | null;
          organization_id: string | null;
          other_attributes: Json | null;
          owner: string | null;
          payment_terms: string | null;
          permissions: string | null;
          postsig_notes: string | null;
          products_fees: Json | null;
          related_contract_id: number | null;
          renewal_period: number | null;
          renewal_type: string | null;
          required_signature_count: number | null;
          scope_of_use: string | null;
          security_awareness: string | null;
          service_level_agreements: string | null;
          status: Database['public']['Enums']['contract_status'];
          status_id: number | null;
          submitted_by: string | null;
          subscription_term: number | null;
          summary: string | null;
          suspension_of_service: string | null;
          term_end_date: Json | null;
          term_start_date: Json | null;
          tos_urls: Json | null;
          trying_to_update_another_doc: boolean | null;
          type_id: number | null;
          updated_at: string | null;
          user_id: string | null;
          valid_from: string;
          valid_to: string | null;
          vendor_id: number | null;
          vendor_location: string | null;
          version_id: number;
          will_not_renew: boolean | null;
          will_not_renew_meta: Json | null;
        };
        Insert: {
          activities?: string | null;
          actor?: string | null;
          ai_extraction?: Json | null;
          ai_extraction_status?:
            | Database['public']['Enums']['ai_extraction_status']
            | null;
          ai_notes?: string | null;
          ai_training_restrictions?: string | null;
          ai_validation?: Json | null;
          all_parties_signed?: string | null;
          annual_increase?: number | null;
          annual_increase_months?: number | null;
          apply_to_overall_spend?: boolean | null;
          arbitration_and_conflict_resolution?: string | null;
          audit_requirements?: string | null;
          auto_renewal?: boolean | null;
          billing_frequency?: string | null;
          business_group?: string | null;
          business_justification?: string | null;
          business_order?: string | null;
          business_sponsor?: Json | null;
          cancel_by_date?: number | null;
          cancel_date?: Json | null;
          cancellation_process?: string | null;
          changed_data?: Json | null;
          client_entity_id?: number | null;
          comment?: string | null;
          contract_id: number;
          cost_mitigation?: string | null;
          created_at?: string;
          created_by?: string | null;
          currency?: string | null;
          data_disposal_tnc?: string | null;
          date_of_last_signature?: string | null;
          decision_reason?: string | null;
          derivative_works?: string | null;
          discount?: number | null;
          distribution_rights?: string | null;
          doc_fully_executed?: boolean | null;
          due_date?: string | null;
          end_users?: string | null;
          exclusivity_terms?: string | null;
          execution_date?: string | null;
          ext_validation?: Json | null;
          external_integration_connection_id?: string | null;
          external_invoice_id?: string | null;
          external_invoice_status?: string | null;
          external_source?: string | null;
          folder_id?: string | null;
          geo_restrictions?: string | null;
          id?: number;
          internal_external_users?: string | null;
          invoice_status?: Database['public']['Enums']['invoice_status'] | null;
          is_duplicate?: boolean;
          last_synced_at?: string | null;
          legacy_renewal_period?: string | null;
          locked_by?: string | null;
          locked_by_email?: string | null;
          market_data_types?: string | null;
          marketing_rights?: string | null;
          metadata?: Json | null;
          multi_year?: boolean | null;
          number_of_users?: string | null;
          open_ai_file_id?: string | null;
          organization_id?: string | null;
          other_attributes?: Json | null;
          owner?: string | null;
          payment_terms?: string | null;
          permissions?: string | null;
          postsig_notes?: string | null;
          products_fees?: Json | null;
          related_contract_id?: number | null;
          renewal_period?: number | null;
          renewal_type?: string | null;
          required_signature_count?: number | null;
          scope_of_use?: string | null;
          security_awareness?: string | null;
          service_level_agreements?: string | null;
          status?: Database['public']['Enums']['contract_status'];
          status_id?: number | null;
          submitted_by?: string | null;
          subscription_term?: number | null;
          summary?: string | null;
          suspension_of_service?: string | null;
          term_end_date?: Json | null;
          term_start_date?: Json | null;
          tos_urls?: Json | null;
          trying_to_update_another_doc?: boolean | null;
          type_id?: number | null;
          updated_at?: string | null;
          user_id?: string | null;
          valid_from?: string;
          valid_to?: string | null;
          vendor_id?: number | null;
          vendor_location?: string | null;
          version_id: number;
          will_not_renew?: boolean | null;
          will_not_renew_meta?: Json | null;
        };
        Update: {
          activities?: string | null;
          actor?: string | null;
          ai_extraction?: Json | null;
          ai_extraction_status?:
            | Database['public']['Enums']['ai_extraction_status']
            | null;
          ai_notes?: string | null;
          ai_training_restrictions?: string | null;
          ai_validation?: Json | null;
          all_parties_signed?: string | null;
          annual_increase?: number | null;
          annual_increase_months?: number | null;
          apply_to_overall_spend?: boolean | null;
          arbitration_and_conflict_resolution?: string | null;
          audit_requirements?: string | null;
          auto_renewal?: boolean | null;
          billing_frequency?: string | null;
          business_group?: string | null;
          business_justification?: string | null;
          business_order?: string | null;
          business_sponsor?: Json | null;
          cancel_by_date?: number | null;
          cancel_date?: Json | null;
          cancellation_process?: string | null;
          changed_data?: Json | null;
          client_entity_id?: number | null;
          comment?: string | null;
          contract_id?: number;
          cost_mitigation?: string | null;
          created_at?: string;
          created_by?: string | null;
          currency?: string | null;
          data_disposal_tnc?: string | null;
          date_of_last_signature?: string | null;
          decision_reason?: string | null;
          derivative_works?: string | null;
          discount?: number | null;
          distribution_rights?: string | null;
          doc_fully_executed?: boolean | null;
          due_date?: string | null;
          end_users?: string | null;
          exclusivity_terms?: string | null;
          execution_date?: string | null;
          ext_validation?: Json | null;
          external_integration_connection_id?: string | null;
          external_invoice_id?: string | null;
          external_invoice_status?: string | null;
          external_source?: string | null;
          folder_id?: string | null;
          geo_restrictions?: string | null;
          id?: number;
          internal_external_users?: string | null;
          invoice_status?: Database['public']['Enums']['invoice_status'] | null;
          is_duplicate?: boolean;
          last_synced_at?: string | null;
          legacy_renewal_period?: string | null;
          locked_by?: string | null;
          locked_by_email?: string | null;
          market_data_types?: string | null;
          marketing_rights?: string | null;
          metadata?: Json | null;
          multi_year?: boolean | null;
          number_of_users?: string | null;
          open_ai_file_id?: string | null;
          organization_id?: string | null;
          other_attributes?: Json | null;
          owner?: string | null;
          payment_terms?: string | null;
          permissions?: string | null;
          postsig_notes?: string | null;
          products_fees?: Json | null;
          related_contract_id?: number | null;
          renewal_period?: number | null;
          renewal_type?: string | null;
          required_signature_count?: number | null;
          scope_of_use?: string | null;
          security_awareness?: string | null;
          service_level_agreements?: string | null;
          status?: Database['public']['Enums']['contract_status'];
          status_id?: number | null;
          submitted_by?: string | null;
          subscription_term?: number | null;
          summary?: string | null;
          suspension_of_service?: string | null;
          term_end_date?: Json | null;
          term_start_date?: Json | null;
          tos_urls?: Json | null;
          trying_to_update_another_doc?: boolean | null;
          type_id?: number | null;
          updated_at?: string | null;
          user_id?: string | null;
          valid_from?: string;
          valid_to?: string | null;
          vendor_id?: number | null;
          vendor_location?: string | null;
          version_id?: number;
          will_not_renew?: boolean | null;
          will_not_renew_meta?: Json | null;
        };
        Relationships: [
          {
            foreignKeyName: 'contract_versions_contract_id_fkey';
            columns: ['contract_id'];
            isOneToOne: false;
            referencedRelation: 'contracts';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'contract_versions_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
        ];
      };
      contracts: {
        Row: {
          activities: string | null;
          ai_extraction: Json | null;
          ai_extraction_status:
            | Database['public']['Enums']['ai_extraction_status']
            | null;
          ai_notes: string | null;
          ai_training_restrictions: string | null;
          ai_validation: Json | null;
          all_parties_signed: string | null;
          annual_increase: number | null;
          annual_increase_months: number | null;
          apply_to_overall_spend: boolean;
          arbitration_and_conflict_resolution: string | null;
          audit_requirements: string | null;
          auto_renewal: boolean | null;
          billing_frequency: string | null;
          business_group: string | null;
          business_justification: string | null;
          business_order: string | null;
          business_sponsor: Json | null;
          cancel_by_date: number | null;
          cancel_date: Json | null;
          cancellation_process: string | null;
          client_entity_id: number | null;
          cost_mitigation: string | null;
          created_at: string | null;
          currency: string | null;
          data_disposal_tnc: string | null;
          date_of_last_signature: string | null;
          decision_reason: string | null;
          derivative_works: string | null;
          discount: number | null;
          distribution_rights: string | null;
          doc_fully_executed: boolean | null;
          due_date: string | null;
          end_users: string | null;
          exclusivity_terms: string | null;
          execution_date: string | null;
          ext_validation: Json | null;
          external_integration_connection_id: string | null;
          external_invoice_id: string | null;
          external_invoice_status: string | null;
          external_source: string | null;
          folder_id: string | null;
          geo_restrictions: string | null;
          id: number;
          internal_external_users: string | null;
          invoice_status: Database['public']['Enums']['invoice_status'] | null;
          is_duplicate: boolean;
          last_synced_at: string | null;
          legacy_renewal_period: string | null;
          locked_by: string | null;
          locked_by_email: string | null;
          market_data_types: string | null;
          marketing_rights: string | null;
          metadata: Json | null;
          multi_year: boolean | null;
          number_of_users: string | null;
          open_ai_file_id: string | null;
          organization_id: string | null;
          other_attributes: Json | null;
          owner: string | null;
          payment_terms: string | null;
          permissions: string | null;
          postsig_notes: string | null;
          products_fees: Json | null;
          related_contract_id: number | null;
          renewal_period: number | null;
          renewal_type: string | null;
          required_signature_count: number | null;
          scope_of_use: string | null;
          security_awareness: string | null;
          service_level_agreements: string | null;
          status: Database['public']['Enums']['contract_status'];
          status_id: number | null;
          submitted_by: string | null;
          subscription_term: number | null;
          summary: string | null;
          suspension_of_service: string | null;
          term_end_date: Json | null;
          term_start_date: Json | null;
          tos_urls: Json | null;
          trying_to_update_another_doc: boolean | null;
          type_id: number | null;
          updated_at: string | null;
          user_id: string | null;
          vendor_id: number | null;
          vendor_location: string | null;
          will_not_renew: boolean | null;
          will_not_renew_meta: Json | null;
          contract_search: string | null;
        };
        Insert: {
          activities?: string | null;
          ai_extraction?: Json | null;
          ai_extraction_status?:
            | Database['public']['Enums']['ai_extraction_status']
            | null;
          ai_notes?: string | null;
          ai_training_restrictions?: string | null;
          ai_validation?: Json | null;
          all_parties_signed?: string | null;
          annual_increase?: number | null;
          annual_increase_months?: number | null;
          apply_to_overall_spend?: boolean;
          arbitration_and_conflict_resolution?: string | null;
          audit_requirements?: string | null;
          auto_renewal?: boolean | null;
          billing_frequency?: string | null;
          business_group?: string | null;
          business_justification?: string | null;
          business_order?: string | null;
          business_sponsor?: Json | null;
          cancel_by_date?: number | null;
          cancel_date?: Json | null;
          cancellation_process?: string | null;
          client_entity_id?: number | null;
          cost_mitigation?: string | null;
          created_at?: string | null;
          currency?: string | null;
          data_disposal_tnc?: string | null;
          date_of_last_signature?: string | null;
          decision_reason?: string | null;
          derivative_works?: string | null;
          discount?: number | null;
          distribution_rights?: string | null;
          doc_fully_executed?: boolean | null;
          due_date?: string | null;
          end_users?: string | null;
          exclusivity_terms?: string | null;
          execution_date?: string | null;
          ext_validation?: Json | null;
          external_integration_connection_id?: string | null;
          external_invoice_id?: string | null;
          external_invoice_status?: string | null;
          external_source?: string | null;
          folder_id?: string | null;
          geo_restrictions?: string | null;
          id?: number;
          internal_external_users?: string | null;
          invoice_status?: Database['public']['Enums']['invoice_status'] | null;
          is_duplicate?: boolean;
          last_synced_at?: string | null;
          legacy_renewal_period?: string | null;
          locked_by?: string | null;
          locked_by_email?: string | null;
          market_data_types?: string | null;
          marketing_rights?: string | null;
          metadata?: Json | null;
          multi_year?: boolean | null;
          number_of_users?: string | null;
          open_ai_file_id?: string | null;
          organization_id?: string | null;
          other_attributes?: Json | null;
          owner?: string | null;
          payment_terms?: string | null;
          permissions?: string | null;
          postsig_notes?: string | null;
          products_fees?: Json | null;
          related_contract_id?: number | null;
          renewal_period?: number | null;
          renewal_type?: string | null;
          required_signature_count?: number | null;
          scope_of_use?: string | null;
          security_awareness?: string | null;
          service_level_agreements?: string | null;
          status?: Database['public']['Enums']['contract_status'];
          status_id?: number | null;
          submitted_by?: string | null;
          subscription_term?: number | null;
          summary?: string | null;
          suspension_of_service?: string | null;
          term_end_date?: Json | null;
          term_start_date?: Json | null;
          tos_urls?: Json | null;
          trying_to_update_another_doc?: boolean | null;
          type_id?: number | null;
          updated_at?: string | null;
          user_id?: string | null;
          vendor_id?: number | null;
          vendor_location?: string | null;
          will_not_renew?: boolean | null;
          will_not_renew_meta?: Json | null;
        };
        Update: {
          activities?: string | null;
          ai_extraction?: Json | null;
          ai_extraction_status?:
            | Database['public']['Enums']['ai_extraction_status']
            | null;
          ai_notes?: string | null;
          ai_training_restrictions?: string | null;
          ai_validation?: Json | null;
          all_parties_signed?: string | null;
          annual_increase?: number | null;
          annual_increase_months?: number | null;
          apply_to_overall_spend?: boolean;
          arbitration_and_conflict_resolution?: string | null;
          audit_requirements?: string | null;
          auto_renewal?: boolean | null;
          billing_frequency?: string | null;
          business_group?: string | null;
          business_justification?: string | null;
          business_order?: string | null;
          business_sponsor?: Json | null;
          cancel_by_date?: number | null;
          cancel_date?: Json | null;
          cancellation_process?: string | null;
          client_entity_id?: number | null;
          cost_mitigation?: string | null;
          created_at?: string | null;
          currency?: string | null;
          data_disposal_tnc?: string | null;
          date_of_last_signature?: string | null;
          decision_reason?: string | null;
          derivative_works?: string | null;
          discount?: number | null;
          distribution_rights?: string | null;
          doc_fully_executed?: boolean | null;
          due_date?: string | null;
          end_users?: string | null;
          exclusivity_terms?: string | null;
          execution_date?: string | null;
          ext_validation?: Json | null;
          external_integration_connection_id?: string | null;
          external_invoice_id?: string | null;
          external_invoice_status?: string | null;
          external_source?: string | null;
          folder_id?: string | null;
          geo_restrictions?: string | null;
          id?: number;
          internal_external_users?: string | null;
          invoice_status?: Database['public']['Enums']['invoice_status'] | null;
          is_duplicate?: boolean;
          last_synced_at?: string | null;
          legacy_renewal_period?: string | null;
          locked_by?: string | null;
          locked_by_email?: string | null;
          market_data_types?: string | null;
          marketing_rights?: string | null;
          metadata?: Json | null;
          multi_year?: boolean | null;
          number_of_users?: string | null;
          open_ai_file_id?: string | null;
          organization_id?: string | null;
          other_attributes?: Json | null;
          owner?: string | null;
          payment_terms?: string | null;
          permissions?: string | null;
          postsig_notes?: string | null;
          products_fees?: Json | null;
          related_contract_id?: number | null;
          renewal_period?: number | null;
          renewal_type?: string | null;
          required_signature_count?: number | null;
          scope_of_use?: string | null;
          security_awareness?: string | null;
          service_level_agreements?: string | null;
          status?: Database['public']['Enums']['contract_status'];
          status_id?: number | null;
          submitted_by?: string | null;
          subscription_term?: number | null;
          summary?: string | null;
          suspension_of_service?: string | null;
          term_end_date?: Json | null;
          term_start_date?: Json | null;
          tos_urls?: Json | null;
          trying_to_update_another_doc?: boolean | null;
          type_id?: number | null;
          updated_at?: string | null;
          user_id?: string | null;
          vendor_id?: number | null;
          vendor_location?: string | null;
          will_not_renew?: boolean | null;
          will_not_renew_meta?: Json | null;
        };
        Relationships: [
          {
            foreignKeyName: 'contracts_client_entity_id_fkey';
            columns: ['client_entity_id'];
            isOneToOne: false;
            referencedRelation: 'client_entities';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'contracts_external_integration_connection_id_fkey';
            columns: ['external_integration_connection_id'];
            isOneToOne: false;
            referencedRelation: 'integration_connections';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'contracts_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'mcp_distinct_orgs';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'contracts_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'contracts_status_id_fkey';
            columns: ['status_id'];
            isOneToOne: false;
            referencedRelation: 'contract_statuses';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'contracts_type_id_fkey';
            columns: ['type_id'];
            isOneToOne: false;
            referencedRelation: 'contract_types';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'contracts_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'contracts_vendor_id_fkey';
            columns: ['vendor_id'];
            isOneToOne: false;
            referencedRelation: 'vendors';
            referencedColumns: ['id'];
          },
        ];
      };
      corporate_actions: {
        Row: {
          action_type: Database['public']['Enums']['CorporateActionType'];
          created_at: string | null;
          created_by: string | null;
          description: string | null;
          effective_date: string;
          id: number;
          notes: Json | null;
          primary_vendor_id: number;
          secondary_vendor_id: number | null;
        };
        Insert: {
          action_type: Database['public']['Enums']['CorporateActionType'];
          created_at?: string | null;
          created_by?: string | null;
          description?: string | null;
          effective_date: string;
          id?: number;
          notes?: Json | null;
          primary_vendor_id: number;
          secondary_vendor_id?: number | null;
        };
        Update: {
          action_type?: Database['public']['Enums']['CorporateActionType'];
          created_at?: string | null;
          created_by?: string | null;
          description?: string | null;
          effective_date?: string;
          id?: number;
          notes?: Json | null;
          primary_vendor_id?: number;
          secondary_vendor_id?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: 'corporate_actions_primary_vendor_id_fkey';
            columns: ['primary_vendor_id'];
            isOneToOne: false;
            referencedRelation: 'vendors';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'corporate_actions_secondary_vendor_id_fkey';
            columns: ['secondary_vendor_id'];
            isOneToOne: false;
            referencedRelation: 'vendors';
            referencedColumns: ['id'];
          },
        ];
      };
      cost_allocation_budgets: {
        Row: {
          amount: number;
          created_at: string;
          created_by: string | null;
          fiscal_year: number;
          id: number;
          org_employee_id: number | null;
          org_unit_id: number | null;
          organization_id: string;
          updated_at: string | null;
          updated_by: string | null;
        };
        Insert: {
          amount: number;
          created_at?: string;
          created_by?: string | null;
          fiscal_year: number;
          id?: number;
          org_employee_id?: number | null;
          org_unit_id?: number | null;
          organization_id: string;
          updated_at?: string | null;
          updated_by?: string | null;
        };
        Update: {
          amount?: number;
          created_at?: string;
          created_by?: string | null;
          fiscal_year?: number;
          id?: number;
          org_employee_id?: number | null;
          org_unit_id?: number | null;
          organization_id?: string;
          updated_at?: string | null;
          updated_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'cost_allocation_budgets_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'cost_allocation_budgets_org_employee_fkey';
            columns: ['organization_id', 'org_employee_id'];
            isOneToOne: false;
            referencedRelation: 'org_employees';
            referencedColumns: ['organization_id', 'id'];
          },
          {
            foreignKeyName: 'cost_allocation_budgets_org_unit_fkey';
            columns: ['organization_id', 'org_unit_id'];
            isOneToOne: false;
            referencedRelation: 'org_units';
            referencedColumns: ['organization_id', 'id'];
          },
          {
            foreignKeyName: 'cost_allocation_budgets_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'mcp_distinct_orgs';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'cost_allocation_budgets_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'cost_allocation_budgets_updated_by_fkey';
            columns: ['updated_by'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
        ];
      };
      data_delivery_types: {
        Row: {
          created_at: string;
          id: number;
          name: string | null;
        };
        Insert: {
          created_at?: string;
          id?: number;
          name?: string | null;
        };
        Update: {
          created_at?: string;
          id?: number;
          name?: string | null;
        };
        Relationships: [];
      };
      document_field_values: {
        Row: {
          created_at: string;
          field_definition_id: string | null;
          id: number;
          module_document_id: number;
          module_extraction_id: string | null;
          updated_at: string;
          value_boolean: boolean | null;
          value_date: string | null;
          value_json: Json | null;
          value_number: number | null;
          value_text: string | null;
        };
        Insert: {
          created_at?: string;
          field_definition_id?: string | null;
          id?: number;
          module_document_id: number;
          module_extraction_id?: string | null;
          updated_at?: string;
          value_boolean?: boolean | null;
          value_date?: string | null;
          value_json?: Json | null;
          value_number?: number | null;
          value_text?: string | null;
        };
        Update: {
          created_at?: string;
          field_definition_id?: string | null;
          id?: number;
          module_document_id?: number;
          module_extraction_id?: string | null;
          updated_at?: string;
          value_boolean?: boolean | null;
          value_date?: string | null;
          value_json?: Json | null;
          value_number?: number | null;
          value_text?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'document_field_values_field_definition_id_fkey';
            columns: ['field_definition_id'];
            isOneToOne: false;
            referencedRelation: 'master_field_definitions';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'document_field_values_module_document_id_fkey';
            columns: ['module_document_id'];
            isOneToOne: false;
            referencedRelation: 'module_documents';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'document_field_values_module_extraction_id_fkey';
            columns: ['module_extraction_id'];
            isOneToOne: false;
            referencedRelation: 'module_document_extractions';
            referencedColumns: ['id'];
          },
        ];
      };
      document_type_fields: {
        Row: {
          created_at: string;
          document_type_id: number;
          id: string;
          master_field_definition_id: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          document_type_id: number;
          id?: string;
          master_field_definition_id: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          document_type_id?: number;
          id?: string;
          master_field_definition_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'document_type_fields_document_type_id_fkey';
            columns: ['document_type_id'];
            isOneToOne: false;
            referencedRelation: 'document_types';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'document_type_fields_master_field_definition_id_fkey';
            columns: ['master_field_definition_id'];
            isOneToOne: false;
            referencedRelation: 'master_field_definitions';
            referencedColumns: ['id'];
          },
        ];
      };
      document_types: {
        Row: {
          code: string;
          created_at: string;
          description: string | null;
          id: number;
          module_id: number;
          name: string;
        };
        Insert: {
          code: string;
          created_at?: string;
          description?: string | null;
          id?: number;
          module_id: number;
          name: string;
        };
        Update: {
          code?: string;
          created_at?: string;
          description?: string | null;
          id?: number;
          module_id?: number;
          name?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'document_types_module_id_fkey';
            columns: ['module_id'];
            isOneToOne: false;
            referencedRelation: 'app_modules';
            referencedColumns: ['id'];
          },
        ];
      };
      documents: {
        Row: {
          content: string | null;
          contract_id: number | null;
          embedding: string | null;
          id: string;
          metadata: Json | null;
          organization_id: string | null;
          user_id: string | null;
        };
        Insert: {
          content?: string | null;
          contract_id?: number | null;
          embedding?: string | null;
          id: string;
          metadata?: Json | null;
          organization_id?: string | null;
          user_id?: string | null;
        };
        Update: {
          content?: string | null;
          contract_id?: number | null;
          embedding?: string | null;
          id?: string;
          metadata?: Json | null;
          organization_id?: string | null;
          user_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'documents_contract_id_fkey';
            columns: ['contract_id'];
            isOneToOne: false;
            referencedRelation: 'contracts';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'documents_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'mcp_distinct_orgs';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'documents_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'documents_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
        ];
      };
      evaluation_results: {
        Row: {
          confidence_score: number;
          contract_id: number;
          created_at: string | null;
          evaluation_run_id: string;
          existing_value: string | null;
          extracted_value: string | null;
          field_name: string;
          id: string;
          processing_time_ms: number;
          prompt_template_id: string;
          relevance_score: number;
          similarity_score: number;
        };
        Insert: {
          confidence_score: number;
          contract_id: number;
          created_at?: string | null;
          evaluation_run_id: string;
          existing_value?: string | null;
          extracted_value?: string | null;
          field_name: string;
          id?: string;
          processing_time_ms?: number;
          prompt_template_id: string;
          relevance_score: number;
          similarity_score: number;
        };
        Update: {
          confidence_score?: number;
          contract_id?: number;
          created_at?: string | null;
          evaluation_run_id?: string;
          existing_value?: string | null;
          extracted_value?: string | null;
          field_name?: string;
          id?: string;
          processing_time_ms?: number;
          prompt_template_id?: string;
          relevance_score?: number;
          similarity_score?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'evaluation_results_evaluation_run_id_fkey';
            columns: ['evaluation_run_id'];
            isOneToOne: false;
            referencedRelation: 'evaluation_runs';
            referencedColumns: ['id'];
          },
        ];
      };
      evaluation_runs: {
        Row: {
          combined_schema: Json;
          completed_at: string | null;
          created_at: string | null;
          error_message: string | null;
          gemini_model: string;
          id: string;
          name: string;
          results_summary: Json | null;
          selected_contract_ids: number[];
          selected_prompt_ids: string[];
          status: string;
          system_prompt_id: string | null;
          user_id: string;
        };
        Insert: {
          combined_schema?: Json;
          completed_at?: string | null;
          created_at?: string | null;
          error_message?: string | null;
          gemini_model?: string;
          id?: string;
          name: string;
          results_summary?: Json | null;
          selected_contract_ids?: number[];
          selected_prompt_ids?: string[];
          status?: string;
          system_prompt_id?: string | null;
          user_id: string;
        };
        Update: {
          combined_schema?: Json;
          completed_at?: string | null;
          created_at?: string | null;
          error_message?: string | null;
          gemini_model?: string;
          id?: string;
          name?: string;
          results_summary?: Json | null;
          selected_contract_ids?: number[];
          selected_prompt_ids?: string[];
          status?: string;
          system_prompt_id?: string | null;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'evaluation_runs_system_prompt_id_fkey';
            columns: ['system_prompt_id'];
            isOneToOne: false;
            referencedRelation: 'prompt_templates';
            referencedColumns: ['id'];
          },
        ];
      };
      exchanges: {
        Row: {
          code: string;
          created_at: string;
          currency: string;
          id: number;
          name: string;
        };
        Insert: {
          code: string;
          created_at?: string;
          currency: string;
          id?: number;
          name: string;
        };
        Update: {
          code?: string;
          created_at?: string;
          currency?: string;
          id?: number;
          name?: string;
        };
        Relationships: [];
      };
      extracted_data: {
        Row: {
          contract_id: number;
          created_at: string | null;
          extracted_fields: Json | null;
          id: string;
          updated_at: string | null;
        };
        Insert: {
          contract_id: number;
          created_at?: string | null;
          extracted_fields?: Json | null;
          id?: string;
          updated_at?: string | null;
        };
        Update: {
          contract_id?: number;
          created_at?: string | null;
          extracted_fields?: Json | null;
          id?: string;
          updated_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'extracted_data_contract_id_fkey';
            columns: ['contract_id'];
            isOneToOne: false;
            referencedRelation: 'contracts';
            referencedColumns: ['id'];
          },
        ];
      };
      feature_flag_attributes: {
        Row: {
          created_at: string;
          entity: string | null;
          id: string;
          key: string;
          system: boolean;
          type: string;
          updated_at: string;
          values: string[] | null;
        };
        Insert: {
          created_at?: string;
          entity?: string | null;
          id?: string;
          key: string;
          system?: boolean;
          type: string;
          updated_at?: string;
          values?: string[] | null;
        };
        Update: {
          created_at?: string;
          entity?: string | null;
          id?: string;
          key?: string;
          system?: boolean;
          type?: string;
          updated_at?: string;
          values?: string[] | null;
        };
        Relationships: [];
      };
      feature_flags: {
        Row: {
          created_at: string;
          enabled: boolean;
          environment: string;
          id: string;
          key: string;
          name: string;
          rules: Json | null;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          enabled?: boolean;
          environment: string;
          id?: string;
          key: string;
          name: string;
          rules?: Json | null;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          enabled?: boolean;
          environment?: string;
          id?: string;
          key?: string;
          name?: string;
          rules?: Json | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      fee_schedule_line_items: {
        Row: {
          asset_class: string | null;
          block_id: string | null;
          charge_subtype: string | null;
          column_labels: string[] | null;
          consolidated_pack: string | null;
          counterparty_role: string | null;
          created_at: string;
          currency: string | null;
          customer_tier: string | null;
          data_timeliness: string | null;
          display_medium: string | null;
          distribution_channel: string | null;
          fee: number | null;
          fee_basis: string | null;
          fee_basis_notes: string | null;
          granularity: string | null;
          id: number;
          level: string | null;
          market: string | null;
          page: number | null;
          price_point_id: string | null;
          product_code: string | null;
          product_code_root: string | null;
          product_id: string;
          row_label: string[] | null;
          section_family: string | null;
          section_path: string[] | null;
          text_value: string | null;
          title: string;
          use_type: string | null;
          user_class: string | null;
          user_count_tier: string | null;
          venues: string | null;
          version_id: number;
          vintage_price_point_id: string | null;
        };
        Insert: {
          asset_class?: string | null;
          block_id?: string | null;
          charge_subtype?: string | null;
          column_labels?: string[] | null;
          consolidated_pack?: string | null;
          counterparty_role?: string | null;
          created_at?: string;
          currency?: string | null;
          customer_tier?: string | null;
          data_timeliness?: string | null;
          display_medium?: string | null;
          distribution_channel?: string | null;
          fee?: number | null;
          fee_basis?: string | null;
          fee_basis_notes?: string | null;
          granularity?: string | null;
          id?: number;
          level?: string | null;
          market?: string | null;
          page?: number | null;
          price_point_id?: string | null;
          product_code?: string | null;
          product_code_root?: string | null;
          product_id: string;
          row_label?: string[] | null;
          section_family?: string | null;
          section_path?: string[] | null;
          text_value?: string | null;
          title: string;
          use_type?: string | null;
          user_class?: string | null;
          user_count_tier?: string | null;
          venues?: string | null;
          version_id: number;
          vintage_price_point_id?: string | null;
        };
        Update: {
          asset_class?: string | null;
          block_id?: string | null;
          charge_subtype?: string | null;
          column_labels?: string[] | null;
          consolidated_pack?: string | null;
          counterparty_role?: string | null;
          created_at?: string;
          currency?: string | null;
          customer_tier?: string | null;
          data_timeliness?: string | null;
          display_medium?: string | null;
          distribution_channel?: string | null;
          fee?: number | null;
          fee_basis?: string | null;
          fee_basis_notes?: string | null;
          granularity?: string | null;
          id?: number;
          level?: string | null;
          market?: string | null;
          page?: number | null;
          price_point_id?: string | null;
          product_code?: string | null;
          product_code_root?: string | null;
          product_id?: string;
          row_label?: string[] | null;
          section_family?: string | null;
          section_path?: string[] | null;
          text_value?: string | null;
          title?: string;
          use_type?: string | null;
          user_class?: string | null;
          user_count_tier?: string | null;
          venues?: string | null;
          version_id?: number;
          vintage_price_point_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'fee_schedule_line_items_version_id_fkey';
            columns: ['version_id'];
            isOneToOne: false;
            referencedRelation: 'fee_schedule_versions';
            referencedColumns: ['id'];
          },
        ];
      };
      fee_schedule_versions: {
        Row: {
          created_at: string;
          effective_date: string;
          exchange_id: number;
          id: number;
          invalidated_date: string | null;
          source_doc: string | null;
          source_document_path: string | null;
          version: string;
          vintage_slug: string;
        };
        Insert: {
          created_at?: string;
          effective_date: string;
          exchange_id: number;
          id?: number;
          invalidated_date?: string | null;
          source_doc?: string | null;
          source_document_path?: string | null;
          version: string;
          vintage_slug: string;
        };
        Update: {
          created_at?: string;
          effective_date?: string;
          exchange_id?: number;
          id?: number;
          invalidated_date?: string | null;
          source_doc?: string | null;
          source_document_path?: string | null;
          version?: string;
          vintage_slug?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'fee_schedule_versions_exchange_id_fkey';
            columns: ['exchange_id'];
            isOneToOne: false;
            referencedRelation: 'exchanges';
            referencedColumns: ['id'];
          },
        ];
      };
      finalized_prompts: {
        Row: {
          created_at: string;
          evaluation_summary: Json;
          id: string;
          labels: string[];
          metadata: Json | null;
          prompt_text: string;
          prompt_version_id: string;
          usage_count: number | null;
        };
        Insert: {
          created_at?: string;
          evaluation_summary: Json;
          id?: string;
          labels?: string[];
          metadata?: Json | null;
          prompt_text: string;
          prompt_version_id: string;
          usage_count?: number | null;
        };
        Update: {
          created_at?: string;
          evaluation_summary?: Json;
          id?: string;
          labels?: string[];
          metadata?: Json | null;
          prompt_text?: string;
          prompt_version_id?: string;
          usage_count?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: 'finalized_prompts_prompt_version_id_fkey';
            columns: ['prompt_version_id'];
            isOneToOne: true;
            referencedRelation: 'prompt_versions';
            referencedColumns: ['id'];
          },
        ];
      };
      folder_acl_group: {
        Row: {
          created_at: string | null;
          folder_id: number;
          group_id: number;
          organization_id: string;
          perm: Database['public']['Enums']['permission_level'];
        };
        Insert: {
          created_at?: string | null;
          folder_id: number;
          group_id: number;
          organization_id: string;
          perm: Database['public']['Enums']['permission_level'];
        };
        Update: {
          created_at?: string | null;
          folder_id?: number;
          group_id?: number;
          organization_id?: string;
          perm?: Database['public']['Enums']['permission_level'];
        };
        Relationships: [
          {
            foreignKeyName: 'folder_acl_group_folder_id_fkey';
            columns: ['folder_id'];
            isOneToOne: false;
            referencedRelation: 'folders';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'folder_acl_group_org_group_fkey';
            columns: ['organization_id', 'group_id'];
            isOneToOne: false;
            referencedRelation: 'groups';
            referencedColumns: ['organization_id', 'id'];
          },
          {
            foreignKeyName: 'folder_acl_group_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'mcp_distinct_orgs';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'folder_acl_group_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
        ];
      };
      folder_acl_user: {
        Row: {
          created_at: string | null;
          folder_id: number;
          organization_id: string;
          perm: Database['public']['Enums']['permission_level'];
          user_id: string;
        };
        Insert: {
          created_at?: string | null;
          folder_id: number;
          organization_id: string;
          perm: Database['public']['Enums']['permission_level'];
          user_id: string;
        };
        Update: {
          created_at?: string | null;
          folder_id?: number;
          organization_id?: string;
          perm?: Database['public']['Enums']['permission_level'];
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'folder_acl_user_folder_id_fkey';
            columns: ['folder_id'];
            isOneToOne: false;
            referencedRelation: 'folders';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'folder_acl_user_org_user_fkey';
            columns: ['organization_id', 'user_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['organization_id', 'id'];
          },
          {
            foreignKeyName: 'folder_acl_user_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'mcp_distinct_orgs';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'folder_acl_user_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
        ];
      };
      folder_contracts: {
        Row: {
          contract_id: number;
          created_at: string | null;
          folder_id: number;
          organization_id: string;
        };
        Insert: {
          contract_id: number;
          created_at?: string | null;
          folder_id: number;
          organization_id: string;
        };
        Update: {
          contract_id?: number;
          created_at?: string | null;
          folder_id?: number;
          organization_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'folder_contracts_contract_id_fkey';
            columns: ['contract_id'];
            isOneToOne: false;
            referencedRelation: 'contracts';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'folder_contracts_folder_id_fkey';
            columns: ['folder_id'];
            isOneToOne: false;
            referencedRelation: 'folders';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'folder_contracts_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'mcp_distinct_orgs';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'folder_contracts_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
        ];
      };
      folders: {
        Row: {
          created_at: string | null;
          id: number;
          name: string;
          organization_id: string;
          parent_id: number | null;
          path: unknown;
          public_uuid: string;
          user_id: string;
        };
        Insert: {
          created_at?: string | null;
          id?: number;
          name: string;
          organization_id: string;
          parent_id?: number | null;
          path: unknown;
          public_uuid?: string;
          user_id: string;
        };
        Update: {
          created_at?: string | null;
          id?: number;
          name?: string;
          organization_id?: string;
          parent_id?: number | null;
          path?: unknown;
          public_uuid?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'folders_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'mcp_distinct_orgs';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'folders_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'folders_parent_id_fkey';
            columns: ['parent_id'];
            isOneToOne: false;
            referencedRelation: 'folders';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'folders_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
        ];
      };
      fx_rates_daily: {
        Row: {
          quote: string;
          rate: number;
          rate_date: string;
        };
        Insert: {
          quote: string;
          rate: number;
          rate_date: string;
        };
        Update: {
          quote?: string;
          rate?: number;
          rate_date?: string;
        };
        Relationships: [];
      };
      group_members: {
        Row: {
          created_at: string | null;
          group_id: number;
          organization_id: string;
          user_id: string;
        };
        Insert: {
          created_at?: string | null;
          group_id: number;
          organization_id: string;
          user_id: string;
        };
        Update: {
          created_at?: string | null;
          group_id?: number;
          organization_id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'group_members_group_id_fkey';
            columns: ['group_id'];
            isOneToOne: false;
            referencedRelation: 'groups';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'group_members_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'mcp_distinct_orgs';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'group_members_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'group_members_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
        ];
      };
      groups: {
        Row: {
          created_at: string | null;
          id: number;
          name: string;
          organization_id: string;
          public_uuid: string;
        };
        Insert: {
          created_at?: string | null;
          id?: number;
          name: string;
          organization_id: string;
          public_uuid?: string;
        };
        Update: {
          created_at?: string | null;
          id?: number;
          name?: string;
          organization_id?: string;
          public_uuid?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'groups_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'mcp_distinct_orgs';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'groups_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
        ];
      };
      integration_connections: {
        Row: {
          account_name: string | null;
          auth_provider: string;
          connected_at: string | null;
          created_at: string;
          disconnected_at: string | null;
          health_detected_at: string | null;
          health_reason: string | null;
          health_status: string;
          id: string;
          import_new_invoices: boolean;
          last_failed_sync_at: string | null;
          last_successful_sync_at: string | null;
          last_sync_at: string | null;
          nango_connection_id: string | null;
          organization_id: string;
          provider: Database['public']['Enums']['integration_provider'];
          provider_account_id: string | null;
          status: string;
          sync_disabled_at: string | null;
          sync_enabled: boolean;
          sync_interval_minutes: number;
          track_unpaid_invoices: boolean;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          account_name?: string | null;
          auth_provider?: string;
          connected_at?: string | null;
          created_at?: string;
          disconnected_at?: string | null;
          health_detected_at?: string | null;
          health_reason?: string | null;
          health_status?: string;
          id?: string;
          import_new_invoices?: boolean;
          last_failed_sync_at?: string | null;
          last_successful_sync_at?: string | null;
          last_sync_at?: string | null;
          nango_connection_id?: string | null;
          organization_id: string;
          provider: Database['public']['Enums']['integration_provider'];
          provider_account_id?: string | null;
          status?: string;
          sync_disabled_at?: string | null;
          sync_enabled?: boolean;
          sync_interval_minutes?: number;
          track_unpaid_invoices?: boolean;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          account_name?: string | null;
          auth_provider?: string;
          connected_at?: string | null;
          created_at?: string;
          disconnected_at?: string | null;
          health_detected_at?: string | null;
          health_reason?: string | null;
          health_status?: string;
          id?: string;
          import_new_invoices?: boolean;
          last_failed_sync_at?: string | null;
          last_successful_sync_at?: string | null;
          last_sync_at?: string | null;
          nango_connection_id?: string | null;
          organization_id?: string;
          provider?: Database['public']['Enums']['integration_provider'];
          provider_account_id?: string | null;
          status?: string;
          sync_disabled_at?: string | null;
          sync_enabled?: boolean;
          sync_interval_minutes?: number;
          track_unpaid_invoices?: boolean;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'integration_connections_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'mcp_distinct_orgs';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'integration_connections_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
        ];
      };
      integration_sync_logs: {
        Row: {
          completed_at: string | null;
          created_at: string;
          details: Json | null;
          error_details: Json | null;
          id: number;
          integration_connection_id: string | null;
          organization_id: string;
          provider: Database['public']['Enums']['integration_provider'];
          records_processed: number;
          started_at: string;
          status: string;
          sync_type: string;
          user_id: string | null;
        };
        Insert: {
          completed_at?: string | null;
          created_at?: string;
          details?: Json | null;
          error_details?: Json | null;
          id?: number;
          integration_connection_id?: string | null;
          organization_id: string;
          provider: Database['public']['Enums']['integration_provider'];
          records_processed?: number;
          started_at?: string;
          status: string;
          sync_type: string;
          user_id?: string | null;
        };
        Update: {
          completed_at?: string | null;
          created_at?: string;
          details?: Json | null;
          error_details?: Json | null;
          id?: number;
          integration_connection_id?: string | null;
          organization_id?: string;
          provider?: Database['public']['Enums']['integration_provider'];
          records_processed?: number;
          started_at?: string;
          status?: string;
          sync_type?: string;
          user_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'integration_sync_logs_integration_connection_id_fkey';
            columns: ['integration_connection_id'];
            isOneToOne: false;
            referencedRelation: 'integration_connections';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'integration_sync_logs_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'mcp_distinct_orgs';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'integration_sync_logs_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
        ];
      };
      inv_board_seat: {
        Row: {
          committee_memberships: string[] | null;
          company_id: number;
          created_at: string;
          designating_fund_id: number | null;
          designating_security_id: number | null;
          effective_date: string;
          end_date: string | null;
          external_id: string | null;
          holder_name: string;
          holder_title: string | null;
          id: number;
          metadata: Json;
          organization_id: string;
          seat_type: string;
          updated_at: string;
        };
        Insert: {
          committee_memberships?: string[] | null;
          company_id: number;
          created_at?: string;
          designating_fund_id?: number | null;
          designating_security_id?: number | null;
          effective_date: string;
          end_date?: string | null;
          external_id?: string | null;
          holder_name: string;
          holder_title?: string | null;
          id?: never;
          metadata?: Json;
          organization_id: string;
          seat_type: string;
          updated_at?: string;
        };
        Update: {
          committee_memberships?: string[] | null;
          company_id?: number;
          created_at?: string;
          designating_fund_id?: number | null;
          designating_security_id?: number | null;
          effective_date?: string;
          end_date?: string | null;
          external_id?: string | null;
          holder_name?: string;
          holder_title?: string | null;
          id?: never;
          metadata?: Json;
          organization_id?: string;
          seat_type?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'inv_board_seat_company_id_fkey';
            columns: ['company_id'];
            isOneToOne: false;
            referencedRelation: 'inv_company';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'inv_board_seat_company_id_fkey';
            columns: ['company_id'];
            isOneToOne: false;
            referencedRelation: 'v_inv_company_valuation';
            referencedColumns: ['company_id'];
          },
          {
            foreignKeyName: 'inv_board_seat_company_id_fkey';
            columns: ['company_id'];
            isOneToOne: false;
            referencedRelation: 'v_inv_info_rights_schedule';
            referencedColumns: ['company_id'];
          },
          {
            foreignKeyName: 'inv_board_seat_designating_fund_id_fkey';
            columns: ['designating_fund_id'];
            isOneToOne: false;
            referencedRelation: 'inv_fund';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'inv_board_seat_designating_security_id_fkey';
            columns: ['designating_security_id'];
            isOneToOne: false;
            referencedRelation: 'inv_security';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'inv_board_seat_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'mcp_distinct_orgs';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'inv_board_seat_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
        ];
      };
      inv_cap_table_snapshot: {
        Row: {
          cap_table_detail: Json;
          common_authorized: number | null;
          common_outstanding: number | null;
          company_id: number;
          conversion_shares_issued: number | null;
          created_at: string;
          external_id: string | null;
          financing_round_id: number | null;
          fully_diluted_total: number;
          id: number;
          implied_valuation: number | null;
          new_money_shares_issued: number | null;
          option_pool_authorized: number | null;
          option_pool_available: number | null;
          option_pool_fd_percent: number | null;
          option_pool_outstanding: number | null;
          organization_id: string;
          our_common_shares: number | null;
          our_fd_ownership_percent: number | null;
          our_ownership_percent: number | null;
          our_preferred_pct: number | null;
          our_preferred_shares: number | null;
          our_total_shares: number | null;
          our_voting_pct: number | null;
          pre_money_preferred_outstanding: number | null;
          preferred_authorized: number | null;
          preferred_outstanding: number | null;
          share_price: number | null;
          snapshot_date: string;
          snapshot_type_id: number | null;
          total_outstanding: number | null;
          updated_at: string;
        };
        Insert: {
          cap_table_detail?: Json;
          common_authorized?: number | null;
          common_outstanding?: number | null;
          company_id: number;
          conversion_shares_issued?: number | null;
          created_at?: string;
          external_id?: string | null;
          financing_round_id?: number | null;
          fully_diluted_total: number;
          id?: never;
          implied_valuation?: number | null;
          new_money_shares_issued?: number | null;
          option_pool_authorized?: number | null;
          option_pool_available?: number | null;
          option_pool_fd_percent?: number | null;
          option_pool_outstanding?: number | null;
          organization_id: string;
          our_common_shares?: number | null;
          our_fd_ownership_percent?: number | null;
          our_ownership_percent?: number | null;
          our_preferred_pct?: number | null;
          our_preferred_shares?: number | null;
          our_total_shares?: number | null;
          our_voting_pct?: number | null;
          pre_money_preferred_outstanding?: number | null;
          preferred_authorized?: number | null;
          preferred_outstanding?: number | null;
          share_price?: number | null;
          snapshot_date: string;
          snapshot_type_id?: number | null;
          total_outstanding?: number | null;
          updated_at?: string;
        };
        Update: {
          cap_table_detail?: Json;
          common_authorized?: number | null;
          common_outstanding?: number | null;
          company_id?: number;
          conversion_shares_issued?: number | null;
          created_at?: string;
          external_id?: string | null;
          financing_round_id?: number | null;
          fully_diluted_total?: number;
          id?: never;
          implied_valuation?: number | null;
          new_money_shares_issued?: number | null;
          option_pool_authorized?: number | null;
          option_pool_available?: number | null;
          option_pool_fd_percent?: number | null;
          option_pool_outstanding?: number | null;
          organization_id?: string;
          our_common_shares?: number | null;
          our_fd_ownership_percent?: number | null;
          our_ownership_percent?: number | null;
          our_preferred_pct?: number | null;
          our_preferred_shares?: number | null;
          our_total_shares?: number | null;
          our_voting_pct?: number | null;
          pre_money_preferred_outstanding?: number | null;
          preferred_authorized?: number | null;
          preferred_outstanding?: number | null;
          share_price?: number | null;
          snapshot_date?: string;
          snapshot_type_id?: number | null;
          total_outstanding?: number | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'inv_cap_table_snapshot_company_id_fkey';
            columns: ['company_id'];
            isOneToOne: false;
            referencedRelation: 'inv_company';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'inv_cap_table_snapshot_company_id_fkey';
            columns: ['company_id'];
            isOneToOne: false;
            referencedRelation: 'v_inv_company_valuation';
            referencedColumns: ['company_id'];
          },
          {
            foreignKeyName: 'inv_cap_table_snapshot_company_id_fkey';
            columns: ['company_id'];
            isOneToOne: false;
            referencedRelation: 'v_inv_info_rights_schedule';
            referencedColumns: ['company_id'];
          },
          {
            foreignKeyName: 'inv_cap_table_snapshot_financing_round_id_fkey';
            columns: ['financing_round_id'];
            isOneToOne: false;
            referencedRelation: 'inv_financing_round';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'inv_cap_table_snapshot_financing_round_id_fkey';
            columns: ['financing_round_id'];
            isOneToOne: false;
            referencedRelation: 'v_inv_round_totals';
            referencedColumns: ['financing_round_id'];
          },
          {
            foreignKeyName: 'inv_cap_table_snapshot_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'mcp_distinct_orgs';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'inv_cap_table_snapshot_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'inv_cap_table_snapshot_snapshot_type_id_fkey';
            columns: ['snapshot_type_id'];
            isOneToOne: false;
            referencedRelation: 'inv_snapshot_types';
            referencedColumns: ['id'];
          },
        ];
      };
      inv_co_investor: {
        Row: {
          amount_invested: number | null;
          contact_email: string | null;
          contact_name: string | null;
          created_at: string;
          currency: string | null;
          external_id: string | null;
          financing_round_id: number;
          has_board_seat: boolean | null;
          id: number;
          investor_name: string;
          investor_type: string | null;
          is_major_investor: boolean | null;
          metadata: Json;
          organization_id: string;
          relationship: string;
          updated_at: string;
        };
        Insert: {
          amount_invested?: number | null;
          contact_email?: string | null;
          contact_name?: string | null;
          created_at?: string;
          currency?: string | null;
          external_id?: string | null;
          financing_round_id: number;
          has_board_seat?: boolean | null;
          id?: never;
          investor_name: string;
          investor_type?: string | null;
          is_major_investor?: boolean | null;
          metadata?: Json;
          organization_id: string;
          relationship?: string;
          updated_at?: string;
        };
        Update: {
          amount_invested?: number | null;
          contact_email?: string | null;
          contact_name?: string | null;
          created_at?: string;
          currency?: string | null;
          external_id?: string | null;
          financing_round_id?: number;
          has_board_seat?: boolean | null;
          id?: never;
          investor_name?: string;
          investor_type?: string | null;
          is_major_investor?: boolean | null;
          metadata?: Json;
          organization_id?: string;
          relationship?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'inv_co_investor_financing_round_id_fkey';
            columns: ['financing_round_id'];
            isOneToOne: false;
            referencedRelation: 'inv_financing_round';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'inv_co_investor_financing_round_id_fkey';
            columns: ['financing_round_id'];
            isOneToOne: false;
            referencedRelation: 'v_inv_round_totals';
            referencedColumns: ['financing_round_id'];
          },
          {
            foreignKeyName: 'inv_co_investor_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'mcp_distinct_orgs';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'inv_co_investor_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
        ];
      };
      inv_companies: {
        Row: {
          address: string | null;
          created_at: string;
          description: string | null;
          domain: string | null;
          email: string | null;
          entity_type: string | null;
          founded_year: number | null;
          headquarters: string | null;
          id: number;
          industry: string | null;
          legal_jurisdiction: string | null;
          legal_name: string | null;
          merged_into_company_id: number | null;
          merger_effective_date: string | null;
          metadata: Json;
          name: string;
          phone: string | null;
          public_id: string;
          status: string | null;
          updated_at: string;
        };
        Insert: {
          address?: string | null;
          created_at?: string;
          description?: string | null;
          domain?: string | null;
          email?: string | null;
          entity_type?: string | null;
          founded_year?: number | null;
          headquarters?: string | null;
          id?: never;
          industry?: string | null;
          legal_jurisdiction?: string | null;
          legal_name?: string | null;
          merged_into_company_id?: number | null;
          merger_effective_date?: string | null;
          metadata?: Json;
          name: string;
          phone?: string | null;
          public_id?: string;
          status?: string | null;
          updated_at?: string;
        };
        Update: {
          address?: string | null;
          created_at?: string;
          description?: string | null;
          domain?: string | null;
          email?: string | null;
          entity_type?: string | null;
          founded_year?: number | null;
          headquarters?: string | null;
          id?: never;
          industry?: string | null;
          legal_jurisdiction?: string | null;
          legal_name?: string | null;
          merged_into_company_id?: number | null;
          merger_effective_date?: string | null;
          metadata?: Json;
          name?: string;
          phone?: string | null;
          public_id?: string;
          status?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'inv_companies_merged_into_company_id_fkey';
            columns: ['merged_into_company_id'];
            isOneToOne: false;
            referencedRelation: 'inv_companies';
            referencedColumns: ['id'];
          },
        ];
      };
      inv_company: {
        Row: {
          company_id: number;
          contact_email: string | null;
          contact_person: string | null;
          created_at: string;
          domain: string | null;
          entry_stage_id: number | null;
          external_id: string | null;
          id: number;
          investment_thesis: string | null;
          metadata: Json;
          name_override: string | null;
          notes: string | null;
          organization_id: string;
          public_id: string;
          sector: string | null;
          stage_id: number | null;
          status: string;
          tags: string[] | null;
          updated_at: string;
        };
        Insert: {
          company_id: number;
          contact_email?: string | null;
          contact_person?: string | null;
          created_at?: string;
          domain?: string | null;
          entry_stage_id?: number | null;
          external_id?: string | null;
          id?: never;
          investment_thesis?: string | null;
          metadata?: Json;
          name_override?: string | null;
          notes?: string | null;
          organization_id: string;
          public_id?: string;
          sector?: string | null;
          stage_id?: number | null;
          status?: string;
          tags?: string[] | null;
          updated_at?: string;
        };
        Update: {
          company_id?: number;
          contact_email?: string | null;
          contact_person?: string | null;
          created_at?: string;
          domain?: string | null;
          entry_stage_id?: number | null;
          external_id?: string | null;
          id?: never;
          investment_thesis?: string | null;
          metadata?: Json;
          name_override?: string | null;
          notes?: string | null;
          organization_id?: string;
          public_id?: string;
          sector?: string | null;
          stage_id?: number | null;
          status?: string;
          tags?: string[] | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'inv_company_company_id_fkey';
            columns: ['company_id'];
            isOneToOne: false;
            referencedRelation: 'inv_companies';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'inv_company_entry_stage_id_fkey';
            columns: ['entry_stage_id'];
            isOneToOne: false;
            referencedRelation: 'inv_stages';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'inv_company_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'mcp_distinct_orgs';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'inv_company_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'inv_company_stage_id_fkey';
            columns: ['stage_id'];
            isOneToOne: false;
            referencedRelation: 'inv_stages';
            referencedColumns: ['id'];
          },
        ];
      };
      inv_company_acl_group: {
        Row: {
          company_id: number;
          created_at: string | null;
          group_id: number;
          organization_id: string;
          perm: Database['public']['Enums']['permission_level'];
        };
        Insert: {
          company_id: number;
          created_at?: string | null;
          group_id: number;
          organization_id: string;
          perm: Database['public']['Enums']['permission_level'];
        };
        Update: {
          company_id?: number;
          created_at?: string | null;
          group_id?: number;
          organization_id?: string;
          perm?: Database['public']['Enums']['permission_level'];
        };
        Relationships: [
          {
            foreignKeyName: 'inv_company_acl_group_company_id_fkey';
            columns: ['company_id'];
            isOneToOne: false;
            referencedRelation: 'inv_company';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'inv_company_acl_group_company_id_fkey';
            columns: ['company_id'];
            isOneToOne: false;
            referencedRelation: 'v_inv_company_valuation';
            referencedColumns: ['company_id'];
          },
          {
            foreignKeyName: 'inv_company_acl_group_company_id_fkey';
            columns: ['company_id'];
            isOneToOne: false;
            referencedRelation: 'v_inv_info_rights_schedule';
            referencedColumns: ['company_id'];
          },
          {
            foreignKeyName: 'inv_company_acl_group_org_fk';
            columns: ['organization_id', 'group_id'];
            isOneToOne: false;
            referencedRelation: 'groups';
            referencedColumns: ['organization_id', 'id'];
          },
          {
            foreignKeyName: 'inv_company_acl_group_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'mcp_distinct_orgs';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'inv_company_acl_group_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
        ];
      };
      inv_company_acl_user: {
        Row: {
          company_id: number;
          created_at: string | null;
          organization_id: string;
          perm: Database['public']['Enums']['permission_level'];
          user_id: string;
        };
        Insert: {
          company_id: number;
          created_at?: string | null;
          organization_id: string;
          perm: Database['public']['Enums']['permission_level'];
          user_id: string;
        };
        Update: {
          company_id?: number;
          created_at?: string | null;
          organization_id?: string;
          perm?: Database['public']['Enums']['permission_level'];
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'inv_company_acl_user_company_id_fkey';
            columns: ['company_id'];
            isOneToOne: false;
            referencedRelation: 'inv_company';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'inv_company_acl_user_company_id_fkey';
            columns: ['company_id'];
            isOneToOne: false;
            referencedRelation: 'v_inv_company_valuation';
            referencedColumns: ['company_id'];
          },
          {
            foreignKeyName: 'inv_company_acl_user_company_id_fkey';
            columns: ['company_id'];
            isOneToOne: false;
            referencedRelation: 'v_inv_info_rights_schedule';
            referencedColumns: ['company_id'];
          },
          {
            foreignKeyName: 'inv_company_acl_user_org_fk';
            columns: ['organization_id', 'user_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['organization_id', 'id'];
          },
          {
            foreignKeyName: 'inv_company_acl_user_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'mcp_distinct_orgs';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'inv_company_acl_user_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
        ];
      };
      inv_corporate_event: {
        Row: {
          announced_date: string | null;
          cash_consideration: number | null;
          created_at: string;
          deferred_consideration: number | null;
          event_date: string;
          event_type: string;
          exchange_ratio: number | null;
          id: number;
          metadata: Json;
          notes: string | null;
          organization_id: string;
          stock_consideration: number | null;
          successor_cost_booked: boolean;
          updated_at: string;
        };
        Insert: {
          announced_date?: string | null;
          cash_consideration?: number | null;
          created_at?: string;
          deferred_consideration?: number | null;
          event_date: string;
          event_type: string;
          exchange_ratio?: number | null;
          id?: never;
          metadata?: Json;
          notes?: string | null;
          organization_id: string;
          stock_consideration?: number | null;
          successor_cost_booked?: boolean;
          updated_at?: string;
        };
        Update: {
          announced_date?: string | null;
          cash_consideration?: number | null;
          created_at?: string;
          deferred_consideration?: number | null;
          event_date?: string;
          event_type?: string;
          exchange_ratio?: number | null;
          id?: never;
          metadata?: Json;
          notes?: string | null;
          organization_id?: string;
          stock_consideration?: number | null;
          successor_cost_booked?: boolean;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'inv_corporate_event_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'mcp_distinct_orgs';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'inv_corporate_event_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
        ];
      };
      inv_corporate_event_party: {
        Row: {
          company_id: number;
          cost_allocation_ratio: number | null;
          created_at: string;
          event_id: number;
          id: number;
          organization_id: string;
          role: string;
          updated_at: string;
        };
        Insert: {
          company_id: number;
          cost_allocation_ratio?: number | null;
          created_at?: string;
          event_id: number;
          id?: never;
          organization_id: string;
          role: string;
          updated_at?: string;
        };
        Update: {
          company_id?: number;
          cost_allocation_ratio?: number | null;
          created_at?: string;
          event_id?: number;
          id?: never;
          organization_id?: string;
          role?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'inv_corporate_event_party_company_fkey';
            columns: ['organization_id', 'company_id'];
            isOneToOne: false;
            referencedRelation: 'inv_company';
            referencedColumns: ['organization_id', 'id'];
          },
          {
            foreignKeyName: 'inv_corporate_event_party_company_fkey';
            columns: ['organization_id', 'company_id'];
            isOneToOne: false;
            referencedRelation: 'v_inv_company_valuation';
            referencedColumns: ['organization_id', 'company_id'];
          },
          {
            foreignKeyName: 'inv_corporate_event_party_event_fkey';
            columns: ['organization_id', 'event_id'];
            isOneToOne: false;
            referencedRelation: 'inv_corporate_event';
            referencedColumns: ['organization_id', 'id'];
          },
          {
            foreignKeyName: 'inv_corporate_event_party_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'mcp_distinct_orgs';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'inv_corporate_event_party_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
        ];
      };
      inv_equity_plan: {
        Row: {
          adoption_date: string | null;
          company_id: number;
          created_at: string;
          expiration_date: string | null;
          external_id: string | null;
          id: number;
          metadata: Json;
          name: string;
          organization_id: string;
          plan_type: string | null;
          public_id: string;
          updated_at: string;
        };
        Insert: {
          adoption_date?: string | null;
          company_id: number;
          created_at?: string;
          expiration_date?: string | null;
          external_id?: string | null;
          id?: never;
          metadata?: Json;
          name: string;
          organization_id: string;
          plan_type?: string | null;
          public_id?: string;
          updated_at?: string;
        };
        Update: {
          adoption_date?: string | null;
          company_id?: number;
          created_at?: string;
          expiration_date?: string | null;
          external_id?: string | null;
          id?: never;
          metadata?: Json;
          name?: string;
          organization_id?: string;
          plan_type?: string | null;
          public_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'inv_equity_plan_company_id_fkey';
            columns: ['company_id'];
            isOneToOne: false;
            referencedRelation: 'inv_company';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'inv_equity_plan_company_id_fkey';
            columns: ['company_id'];
            isOneToOne: false;
            referencedRelation: 'v_inv_company_valuation';
            referencedColumns: ['company_id'];
          },
          {
            foreignKeyName: 'inv_equity_plan_company_id_fkey';
            columns: ['company_id'];
            isOneToOne: false;
            referencedRelation: 'v_inv_info_rights_schedule';
            referencedColumns: ['company_id'];
          },
          {
            foreignKeyName: 'inv_equity_plan_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'mcp_distinct_orgs';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'inv_equity_plan_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
        ];
      };
      inv_equity_plan_snapshot: {
        Row: {
          authorized_shares: number | null;
          cancelled_shares: number | null;
          created_at: string;
          effective_date: string;
          exercised_shares: number | null;
          external_id: string | null;
          id: number;
          issued_shares: number | null;
          metadata: Json;
          organization_id: string;
          outstanding_options: number | null;
          plan_id: number;
          pool_percent_fd: number | null;
          updated_at: string;
        };
        Insert: {
          authorized_shares?: number | null;
          cancelled_shares?: number | null;
          created_at?: string;
          effective_date: string;
          exercised_shares?: number | null;
          external_id?: string | null;
          id?: never;
          issued_shares?: number | null;
          metadata?: Json;
          organization_id: string;
          outstanding_options?: number | null;
          plan_id: number;
          pool_percent_fd?: number | null;
          updated_at?: string;
        };
        Update: {
          authorized_shares?: number | null;
          cancelled_shares?: number | null;
          created_at?: string;
          effective_date?: string;
          exercised_shares?: number | null;
          external_id?: string | null;
          id?: never;
          issued_shares?: number | null;
          metadata?: Json;
          organization_id?: string;
          outstanding_options?: number | null;
          plan_id?: number;
          pool_percent_fd?: number | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'inv_equity_plan_snapshot_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'mcp_distinct_orgs';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'inv_equity_plan_snapshot_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'inv_equity_plan_snapshot_plan_id_fkey';
            columns: ['plan_id'];
            isOneToOne: false;
            referencedRelation: 'inv_equity_plan';
            referencedColumns: ['id'];
          },
        ];
      };
      inv_financing_round: {
        Row: {
          announced_date: string | null;
          company_id: number;
          created_at: string;
          currency: string;
          external_id: string | null;
          final_close_date: string | null;
          id: number;
          initial_close_date: string | null;
          metadata: Json;
          name: string;
          notes: string | null;
          organization_id: string;
          pre_money_valuation: number | null;
          public_id: string;
          stage_id: number | null;
          total_raised: number | null;
          updated_at: string;
        };
        Insert: {
          announced_date?: string | null;
          company_id: number;
          created_at?: string;
          currency?: string;
          external_id?: string | null;
          final_close_date?: string | null;
          id?: never;
          initial_close_date?: string | null;
          metadata?: Json;
          name: string;
          notes?: string | null;
          organization_id: string;
          pre_money_valuation?: number | null;
          public_id?: string;
          stage_id?: number | null;
          total_raised?: number | null;
          updated_at?: string;
        };
        Update: {
          announced_date?: string | null;
          company_id?: number;
          created_at?: string;
          currency?: string;
          external_id?: string | null;
          final_close_date?: string | null;
          id?: never;
          initial_close_date?: string | null;
          metadata?: Json;
          name?: string;
          notes?: string | null;
          organization_id?: string;
          pre_money_valuation?: number | null;
          public_id?: string;
          stage_id?: number | null;
          total_raised?: number | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'inv_financing_round_company_id_fkey';
            columns: ['company_id'];
            isOneToOne: false;
            referencedRelation: 'inv_company';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'inv_financing_round_company_id_fkey';
            columns: ['company_id'];
            isOneToOne: false;
            referencedRelation: 'v_inv_company_valuation';
            referencedColumns: ['company_id'];
          },
          {
            foreignKeyName: 'inv_financing_round_company_id_fkey';
            columns: ['company_id'];
            isOneToOne: false;
            referencedRelation: 'v_inv_info_rights_schedule';
            referencedColumns: ['company_id'];
          },
          {
            foreignKeyName: 'inv_financing_round_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'mcp_distinct_orgs';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'inv_financing_round_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'inv_financing_round_stage_id_fkey';
            columns: ['stage_id'];
            isOneToOne: false;
            referencedRelation: 'inv_stages';
            referencedColumns: ['id'];
          },
        ];
      };
      inv_fund: {
        Row: {
          code: string | null;
          committed_capital: number | null;
          created_at: string;
          currency: string;
          description: string | null;
          external_id: string | null;
          id: number;
          metadata: Json;
          name: string;
          organization_id: string;
          public_id: string;
          short_name: string | null;
          status: string;
          target_size: number | null;
          updated_at: string;
          vintage_year: number | null;
        };
        Insert: {
          code?: string | null;
          committed_capital?: number | null;
          created_at?: string;
          currency?: string;
          description?: string | null;
          external_id?: string | null;
          id?: never;
          metadata?: Json;
          name: string;
          organization_id: string;
          public_id?: string;
          short_name?: string | null;
          status?: string;
          target_size?: number | null;
          updated_at?: string;
          vintage_year?: number | null;
        };
        Update: {
          code?: string | null;
          committed_capital?: number | null;
          created_at?: string;
          currency?: string;
          description?: string | null;
          external_id?: string | null;
          id?: never;
          metadata?: Json;
          name?: string;
          organization_id?: string;
          public_id?: string;
          short_name?: string | null;
          status?: string;
          target_size?: number | null;
          updated_at?: string;
          vintage_year?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: 'inv_fund_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'mcp_distinct_orgs';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'inv_fund_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
        ];
      };
      inv_fund_acl_group: {
        Row: {
          created_at: string | null;
          fund_id: number;
          group_id: number;
          organization_id: string;
          perm: Database['public']['Enums']['permission_level'];
        };
        Insert: {
          created_at?: string | null;
          fund_id: number;
          group_id: number;
          organization_id: string;
          perm: Database['public']['Enums']['permission_level'];
        };
        Update: {
          created_at?: string | null;
          fund_id?: number;
          group_id?: number;
          organization_id?: string;
          perm?: Database['public']['Enums']['permission_level'];
        };
        Relationships: [
          {
            foreignKeyName: 'inv_fund_acl_group_fund_id_fkey';
            columns: ['fund_id'];
            isOneToOne: false;
            referencedRelation: 'inv_fund';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'inv_fund_acl_group_org_fk';
            columns: ['organization_id', 'group_id'];
            isOneToOne: false;
            referencedRelation: 'groups';
            referencedColumns: ['organization_id', 'id'];
          },
          {
            foreignKeyName: 'inv_fund_acl_group_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'mcp_distinct_orgs';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'inv_fund_acl_group_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
        ];
      };
      inv_fund_acl_user: {
        Row: {
          created_at: string | null;
          fund_id: number;
          organization_id: string;
          perm: Database['public']['Enums']['permission_level'];
          user_id: string;
        };
        Insert: {
          created_at?: string | null;
          fund_id: number;
          organization_id: string;
          perm: Database['public']['Enums']['permission_level'];
          user_id: string;
        };
        Update: {
          created_at?: string | null;
          fund_id?: number;
          organization_id?: string;
          perm?: Database['public']['Enums']['permission_level'];
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'inv_fund_acl_user_fund_id_fkey';
            columns: ['fund_id'];
            isOneToOne: false;
            referencedRelation: 'inv_fund';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'inv_fund_acl_user_org_fk';
            columns: ['organization_id', 'user_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['organization_id', 'id'];
          },
          {
            foreignKeyName: 'inv_fund_acl_user_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'mcp_distinct_orgs';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'inv_fund_acl_user_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
        ];
      };
      inv_history: {
        Row: {
          action: string;
          changes: Json;
          created_at: string;
          created_by: string;
          id: number;
          organization_id: string;
          public_uuid: string;
          reason: string;
          row_id: number;
          snapshot: Json | null;
          table_name: string;
        };
        Insert: {
          action: string;
          changes: Json;
          created_at?: string;
          created_by: string;
          id?: never;
          organization_id: string;
          public_uuid?: string;
          reason?: string;
          row_id: number;
          snapshot?: Json | null;
          table_name: string;
        };
        Update: {
          action?: string;
          changes?: Json;
          created_at?: string;
          created_by?: string;
          id?: never;
          organization_id?: string;
          public_uuid?: string;
          reason?: string;
          row_id?: number;
          snapshot?: Json | null;
          table_name?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'inv_history_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'inv_history_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'mcp_distinct_orgs';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'inv_history_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
        ];
      };
      inv_information_rights: {
        Row: {
          audited_monthly: boolean | null;
          audited_quarterly: boolean | null;
          audited_year_end: boolean | null;
          cap_table_access: boolean | null;
          company_id: number;
          created_at: string;
          effective_date: string;
          expiration_date: string | null;
          external_id: string | null;
          financing_round_id: number | null;
          id: number;
          info_rights_for_all: boolean | null;
          info_rights_for_major: boolean | null;
          inspection_rights: boolean | null;
          is_major_investor: boolean;
          major_investor_threshold: number | null;
          metadata: Json;
          monthly_balance_sheet: boolean | null;
          monthly_cap_table: boolean | null;
          monthly_income_cash_flows: boolean | null;
          monthly_stockholders_equity: boolean | null;
          monthly_timing_days: number | null;
          notes: string | null;
          organization_id: string;
          quarterly_balance_sheet: boolean | null;
          quarterly_cap_table: boolean | null;
          quarterly_income_cash_flows: boolean | null;
          quarterly_stockholders_equity: boolean | null;
          quarterly_timing_days: number | null;
          reporting_contact_email: string | null;
          reporting_contact_name: string | null;
          updated_at: string;
          year_end_balance_sheet: boolean | null;
          year_end_budget_business_plan: boolean | null;
          year_end_cap_table: boolean | null;
          year_end_income_cash_flows: boolean | null;
          year_end_stockholders_equity: boolean | null;
          year_end_timing_days: number | null;
        };
        Insert: {
          audited_monthly?: boolean | null;
          audited_quarterly?: boolean | null;
          audited_year_end?: boolean | null;
          cap_table_access?: boolean | null;
          company_id: number;
          created_at?: string;
          effective_date: string;
          expiration_date?: string | null;
          external_id?: string | null;
          financing_round_id?: number | null;
          id?: never;
          info_rights_for_all?: boolean | null;
          info_rights_for_major?: boolean | null;
          inspection_rights?: boolean | null;
          is_major_investor?: boolean;
          major_investor_threshold?: number | null;
          metadata?: Json;
          monthly_balance_sheet?: boolean | null;
          monthly_cap_table?: boolean | null;
          monthly_income_cash_flows?: boolean | null;
          monthly_stockholders_equity?: boolean | null;
          monthly_timing_days?: number | null;
          notes?: string | null;
          organization_id: string;
          quarterly_balance_sheet?: boolean | null;
          quarterly_cap_table?: boolean | null;
          quarterly_income_cash_flows?: boolean | null;
          quarterly_stockholders_equity?: boolean | null;
          quarterly_timing_days?: number | null;
          reporting_contact_email?: string | null;
          reporting_contact_name?: string | null;
          updated_at?: string;
          year_end_balance_sheet?: boolean | null;
          year_end_budget_business_plan?: boolean | null;
          year_end_cap_table?: boolean | null;
          year_end_income_cash_flows?: boolean | null;
          year_end_stockholders_equity?: boolean | null;
          year_end_timing_days?: number | null;
        };
        Update: {
          audited_monthly?: boolean | null;
          audited_quarterly?: boolean | null;
          audited_year_end?: boolean | null;
          cap_table_access?: boolean | null;
          company_id?: number;
          created_at?: string;
          effective_date?: string;
          expiration_date?: string | null;
          external_id?: string | null;
          financing_round_id?: number | null;
          id?: never;
          info_rights_for_all?: boolean | null;
          info_rights_for_major?: boolean | null;
          inspection_rights?: boolean | null;
          is_major_investor?: boolean;
          major_investor_threshold?: number | null;
          metadata?: Json;
          monthly_balance_sheet?: boolean | null;
          monthly_cap_table?: boolean | null;
          monthly_income_cash_flows?: boolean | null;
          monthly_stockholders_equity?: boolean | null;
          monthly_timing_days?: number | null;
          notes?: string | null;
          organization_id?: string;
          quarterly_balance_sheet?: boolean | null;
          quarterly_cap_table?: boolean | null;
          quarterly_income_cash_flows?: boolean | null;
          quarterly_stockholders_equity?: boolean | null;
          quarterly_timing_days?: number | null;
          reporting_contact_email?: string | null;
          reporting_contact_name?: string | null;
          updated_at?: string;
          year_end_balance_sheet?: boolean | null;
          year_end_budget_business_plan?: boolean | null;
          year_end_cap_table?: boolean | null;
          year_end_income_cash_flows?: boolean | null;
          year_end_stockholders_equity?: boolean | null;
          year_end_timing_days?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: 'inv_information_rights_company_id_fkey';
            columns: ['company_id'];
            isOneToOne: false;
            referencedRelation: 'inv_company';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'inv_information_rights_company_id_fkey';
            columns: ['company_id'];
            isOneToOne: false;
            referencedRelation: 'v_inv_company_valuation';
            referencedColumns: ['company_id'];
          },
          {
            foreignKeyName: 'inv_information_rights_company_id_fkey';
            columns: ['company_id'];
            isOneToOne: false;
            referencedRelation: 'v_inv_info_rights_schedule';
            referencedColumns: ['company_id'];
          },
          {
            foreignKeyName: 'inv_information_rights_financing_round_id_fkey';
            columns: ['financing_round_id'];
            isOneToOne: false;
            referencedRelation: 'inv_financing_round';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'inv_information_rights_financing_round_id_fkey';
            columns: ['financing_round_id'];
            isOneToOne: false;
            referencedRelation: 'v_inv_round_totals';
            referencedColumns: ['financing_round_id'];
          },
          {
            foreignKeyName: 'inv_information_rights_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'mcp_distinct_orgs';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'inv_information_rights_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
        ];
      };
      inv_kpi: {
        Row: {
          category: string;
          code: string | null;
          created_at: string;
          created_by: string | null;
          description: string | null;
          id: number;
          is_active: boolean;
          is_flow: boolean;
          label: string;
          organization_id: string | null;
          placeholder: string | null;
          public_id: string;
          sort_order: number;
          unit: string | null;
          updated_at: string;
          value_type: string;
        };
        Insert: {
          category: string;
          code?: string | null;
          created_at?: string;
          created_by?: string | null;
          description?: string | null;
          id?: never;
          is_active?: boolean;
          is_flow?: boolean;
          label: string;
          organization_id?: string | null;
          placeholder?: string | null;
          public_id?: string;
          sort_order?: number;
          unit?: string | null;
          updated_at?: string;
          value_type: string;
        };
        Update: {
          category?: string;
          code?: string | null;
          created_at?: string;
          created_by?: string | null;
          description?: string | null;
          id?: never;
          is_active?: boolean;
          is_flow?: boolean;
          label?: string;
          organization_id?: string | null;
          placeholder?: string | null;
          public_id?: string;
          sort_order?: number;
          unit?: string | null;
          updated_at?: string;
          value_type?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'inv_kpi_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'inv_kpi_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'mcp_distinct_orgs';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'inv_kpi_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
        ];
      };
      inv_kpi_extraction_mapping: {
        Row: {
          company_id: number;
          id: number;
          kpi_id: number;
          label_text: string;
          last_confirmed_at: string;
          last_confirmed_by: string | null;
          organization_id: string;
          sheet_name: string;
          unit_multiplier: number;
        };
        Insert: {
          company_id: number;
          id?: never;
          kpi_id: number;
          label_text: string;
          last_confirmed_at?: string;
          last_confirmed_by?: string | null;
          organization_id: string;
          sheet_name: string;
          unit_multiplier?: number;
        };
        Update: {
          company_id?: number;
          id?: never;
          kpi_id?: number;
          label_text?: string;
          last_confirmed_at?: string;
          last_confirmed_by?: string | null;
          organization_id?: string;
          sheet_name?: string;
          unit_multiplier?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'inv_kpi_extraction_mapping_company_org_fk';
            columns: ['company_id', 'organization_id'];
            isOneToOne: false;
            referencedRelation: 'inv_company';
            referencedColumns: ['id', 'organization_id'];
          },
          {
            foreignKeyName: 'inv_kpi_extraction_mapping_company_org_fk';
            columns: ['company_id', 'organization_id'];
            isOneToOne: false;
            referencedRelation: 'v_inv_company_valuation';
            referencedColumns: ['company_id', 'organization_id'];
          },
          {
            foreignKeyName: 'inv_kpi_extraction_mapping_kpi_id_fkey';
            columns: ['kpi_id'];
            isOneToOne: false;
            referencedRelation: 'inv_kpi';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'inv_kpi_extraction_mapping_last_confirmed_by_fkey';
            columns: ['last_confirmed_by'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
        ];
      };
      inv_kpi_extraction_run: {
        Row: {
          company_id: number;
          created_at: string;
          error: string | null;
          id: number;
          model_id: string | null;
          module_document_id: number;
          organization_id: string;
          period_month: number | null;
          period_quarter: number | null;
          period_type: string | null;
          period_year: number;
          public_id: string;
          requested_by: string | null;
          result: Json | null;
          status: string;
          updated_at: string;
        };
        Insert: {
          company_id: number;
          created_at?: string;
          error?: string | null;
          id?: never;
          model_id?: string | null;
          module_document_id: number;
          organization_id: string;
          period_month?: number | null;
          period_quarter?: number | null;
          period_type?: string | null;
          period_year: number;
          public_id?: string;
          requested_by?: string | null;
          result?: Json | null;
          status?: string;
          updated_at?: string;
        };
        Update: {
          company_id?: number;
          created_at?: string;
          error?: string | null;
          id?: never;
          model_id?: string | null;
          module_document_id?: number;
          organization_id?: string;
          period_month?: number | null;
          period_quarter?: number | null;
          period_type?: string | null;
          period_year?: number;
          public_id?: string;
          requested_by?: string | null;
          result?: Json | null;
          status?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'inv_kpi_extraction_run_company_org_fk';
            columns: ['company_id', 'organization_id'];
            isOneToOne: false;
            referencedRelation: 'inv_company';
            referencedColumns: ['id', 'organization_id'];
          },
          {
            foreignKeyName: 'inv_kpi_extraction_run_company_org_fk';
            columns: ['company_id', 'organization_id'];
            isOneToOne: false;
            referencedRelation: 'v_inv_company_valuation';
            referencedColumns: ['company_id', 'organization_id'];
          },
          {
            foreignKeyName: 'inv_kpi_extraction_run_module_document_id_fkey';
            columns: ['module_document_id'];
            isOneToOne: false;
            referencedRelation: 'module_documents';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'inv_kpi_extraction_run_requested_by_fkey';
            columns: ['requested_by'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
        ];
      };
      inv_kpi_period_discovery: {
        Row: {
          company_id: number | null;
          created_at: string;
          error: string | null;
          id: number;
          model_id: string | null;
          module_document_id: number;
          organization_id: string;
          public_id: string;
          requested_by: string | null;
          result: Json | null;
          status: string;
          updated_at: string;
        };
        Insert: {
          company_id?: number | null;
          created_at?: string;
          error?: string | null;
          id?: never;
          model_id?: string | null;
          module_document_id: number;
          organization_id: string;
          public_id?: string;
          requested_by?: string | null;
          result?: Json | null;
          status?: string;
          updated_at?: string;
        };
        Update: {
          company_id?: number | null;
          created_at?: string;
          error?: string | null;
          id?: never;
          model_id?: string | null;
          module_document_id?: number;
          organization_id?: string;
          public_id?: string;
          requested_by?: string | null;
          result?: Json | null;
          status?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'inv_kpi_period_discovery_company_org_fk';
            columns: ['company_id', 'organization_id'];
            isOneToOne: false;
            referencedRelation: 'inv_company';
            referencedColumns: ['id', 'organization_id'];
          },
          {
            foreignKeyName: 'inv_kpi_period_discovery_company_org_fk';
            columns: ['company_id', 'organization_id'];
            isOneToOne: false;
            referencedRelation: 'v_inv_company_valuation';
            referencedColumns: ['company_id', 'organization_id'];
          },
          {
            foreignKeyName: 'inv_kpi_period_discovery_document_org_fk';
            columns: ['module_document_id', 'organization_id'];
            isOneToOne: false;
            referencedRelation: 'module_documents';
            referencedColumns: ['id', 'organization_id'];
          },
          {
            foreignKeyName: 'inv_kpi_period_discovery_requested_by_fkey';
            columns: ['requested_by'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
        ];
      };
      inv_kpi_reporting_completion: {
        Row: {
          completed_by: string | null;
          created_at: string;
          id: number;
          module_document_id: number;
          organization_id: string;
          period_month: number | null;
          period_quarter: number | null;
          period_type: string | null;
          period_year: number;
          public_id: string;
          updated_at: string;
        };
        Insert: {
          completed_by?: string | null;
          created_at?: string;
          id?: never;
          module_document_id: number;
          organization_id: string;
          period_month?: number | null;
          period_quarter?: number | null;
          period_type?: string | null;
          period_year: number;
          public_id?: string;
          updated_at?: string;
        };
        Update: {
          completed_by?: string | null;
          created_at?: string;
          id?: never;
          module_document_id?: number;
          organization_id?: string;
          period_month?: number | null;
          period_quarter?: number | null;
          period_type?: string | null;
          period_year?: number;
          public_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'inv_kpi_reporting_completion_completed_by_fkey';
            columns: ['completed_by'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'inv_kpi_reporting_completion_document_org_fk';
            columns: ['module_document_id', 'organization_id'];
            isOneToOne: false;
            referencedRelation: 'module_documents';
            referencedColumns: ['id', 'organization_id'];
          },
        ];
      };
      inv_kpi_value: {
        Row: {
          company_id: number;
          created_at: string;
          created_by: string | null;
          id: number;
          kpi_id: number;
          organization_id: string;
          origin: string;
          period_month: number | null;
          period_quarter: number | null;
          period_type: string | null;
          period_year: number;
          source: string | null;
          submission_id: number | null;
          updated_at: string;
          value_numeric: number | null;
          value_text: string | null;
        };
        Insert: {
          company_id: number;
          created_at?: string;
          created_by?: string | null;
          id?: never;
          kpi_id: number;
          organization_id: string;
          origin: string;
          period_month?: number | null;
          period_quarter?: number | null;
          period_type?: string | null;
          period_year: number;
          source?: string | null;
          submission_id?: number | null;
          updated_at?: string;
          value_numeric?: number | null;
          value_text?: string | null;
        };
        Update: {
          company_id?: number;
          created_at?: string;
          created_by?: string | null;
          id?: never;
          kpi_id?: number;
          organization_id?: string;
          origin?: string;
          period_month?: number | null;
          period_quarter?: number | null;
          period_type?: string | null;
          period_year?: number;
          source?: string | null;
          submission_id?: number | null;
          updated_at?: string;
          value_numeric?: number | null;
          value_text?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'inv_kpi_value_company_org_fk';
            columns: ['company_id', 'organization_id'];
            isOneToOne: false;
            referencedRelation: 'inv_company';
            referencedColumns: ['id', 'organization_id'];
          },
          {
            foreignKeyName: 'inv_kpi_value_company_org_fk';
            columns: ['company_id', 'organization_id'];
            isOneToOne: false;
            referencedRelation: 'v_inv_company_valuation';
            referencedColumns: ['company_id', 'organization_id'];
          },
          {
            foreignKeyName: 'inv_kpi_value_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'inv_kpi_value_kpi_fk';
            columns: ['kpi_id'];
            isOneToOne: false;
            referencedRelation: 'inv_kpi';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'inv_kpi_value_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'mcp_distinct_orgs';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'inv_kpi_value_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'inv_kpi_value_submission_fk';
            columns: ['submission_id', 'organization_id', 'company_id'];
            isOneToOne: false;
            referencedRelation: 'inv_reporting_submission';
            referencedColumns: ['id', 'organization_id', 'company_id'];
          },
        ];
      };
      inv_portco_user: {
        Row: {
          company_id: number;
          created_at: string;
          organization_id: string;
          user_id: string;
        };
        Insert: {
          company_id: number;
          created_at?: string;
          organization_id: string;
          user_id: string;
        };
        Update: {
          company_id?: number;
          created_at?: string;
          organization_id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'inv_portco_user_company_org_fk';
            columns: ['company_id', 'organization_id'];
            isOneToOne: false;
            referencedRelation: 'inv_company';
            referencedColumns: ['id', 'organization_id'];
          },
          {
            foreignKeyName: 'inv_portco_user_company_org_fk';
            columns: ['company_id', 'organization_id'];
            isOneToOne: false;
            referencedRelation: 'v_inv_company_valuation';
            referencedColumns: ['company_id', 'organization_id'];
          },
          {
            foreignKeyName: 'inv_portco_user_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
        ];
      };
      inv_reporting_doc_type: {
        Row: {
          code: string;
          created_at: string;
          display_name: string;
          id: number;
          sort_order: number;
        };
        Insert: {
          code: string;
          created_at?: string;
          display_name: string;
          id?: never;
          sort_order: number;
        };
        Update: {
          code?: string;
          created_at?: string;
          display_name?: string;
          id?: never;
          sort_order?: number;
        };
        Relationships: [];
      };
      inv_reporting_document: {
        Row: {
          company_id: number;
          created_at: string;
          custom_doc_type: string | null;
          doc_type_id: number | null;
          file_hash: string | null;
          file_name: string;
          file_path: string;
          file_size: number | null;
          file_type: string | null;
          id: number;
          is_deleted: boolean;
          organization_id: string;
          public_id: string;
          submission_id: number;
          updated_at: string;
          uploaded_by: string | null;
        };
        Insert: {
          company_id: number;
          created_at?: string;
          custom_doc_type?: string | null;
          doc_type_id?: number | null;
          file_hash?: string | null;
          file_name: string;
          file_path: string;
          file_size?: number | null;
          file_type?: string | null;
          id?: never;
          is_deleted?: boolean;
          organization_id: string;
          public_id?: string;
          submission_id: number;
          updated_at?: string;
          uploaded_by?: string | null;
        };
        Update: {
          company_id?: number;
          created_at?: string;
          custom_doc_type?: string | null;
          doc_type_id?: number | null;
          file_hash?: string | null;
          file_name?: string;
          file_path?: string;
          file_size?: number | null;
          file_type?: string | null;
          id?: never;
          is_deleted?: boolean;
          organization_id?: string;
          public_id?: string;
          submission_id?: number;
          updated_at?: string;
          uploaded_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'inv_reporting_document_company_id_fkey';
            columns: ['company_id'];
            isOneToOne: false;
            referencedRelation: 'inv_company';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'inv_reporting_document_company_id_fkey';
            columns: ['company_id'];
            isOneToOne: false;
            referencedRelation: 'v_inv_company_valuation';
            referencedColumns: ['company_id'];
          },
          {
            foreignKeyName: 'inv_reporting_document_company_id_fkey';
            columns: ['company_id'];
            isOneToOne: false;
            referencedRelation: 'v_inv_info_rights_schedule';
            referencedColumns: ['company_id'];
          },
          {
            foreignKeyName: 'inv_reporting_document_doc_type_id_fkey';
            columns: ['doc_type_id'];
            isOneToOne: false;
            referencedRelation: 'inv_reporting_doc_type';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'inv_reporting_document_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'mcp_distinct_orgs';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'inv_reporting_document_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'inv_reporting_document_submission_fk';
            columns: ['submission_id', 'organization_id', 'company_id'];
            isOneToOne: false;
            referencedRelation: 'inv_reporting_submission';
            referencedColumns: ['id', 'organization_id', 'company_id'];
          },
          {
            foreignKeyName: 'inv_reporting_document_uploaded_by_fkey';
            columns: ['uploaded_by'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
        ];
      };
      inv_reporting_event: {
        Row: {
          actor_user_id: string | null;
          company_id: number;
          created_at: string;
          event_type: string;
          id: number;
          organization_id: string;
          payload: Json;
        };
        Insert: {
          actor_user_id?: string | null;
          company_id: number;
          created_at?: string;
          event_type: string;
          id?: never;
          organization_id: string;
          payload?: Json;
        };
        Update: {
          actor_user_id?: string | null;
          company_id?: number;
          created_at?: string;
          event_type?: string;
          id?: never;
          organization_id?: string;
          payload?: Json;
        };
        Relationships: [
          {
            foreignKeyName: 'inv_reporting_event_actor_user_id_fkey';
            columns: ['actor_user_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'inv_reporting_event_company_org_fk';
            columns: ['company_id', 'organization_id'];
            isOneToOne: false;
            referencedRelation: 'inv_company';
            referencedColumns: ['id', 'organization_id'];
          },
          {
            foreignKeyName: 'inv_reporting_event_company_org_fk';
            columns: ['company_id', 'organization_id'];
            isOneToOne: false;
            referencedRelation: 'v_inv_company_valuation';
            referencedColumns: ['company_id', 'organization_id'];
          },
          {
            foreignKeyName: 'inv_reporting_event_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'mcp_distinct_orgs';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'inv_reporting_event_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
        ];
      };
      inv_reporting_request: {
        Row: {
          company_id: number;
          created_at: string;
          due_date: string | null;
          id: number;
          invite_id: number | null;
          last_reminder_at: string | null;
          message: string | null;
          organization_id: string;
          period_quarter: number | null;
          period_year: number;
          public_id: string;
          request_type: string;
          sent_at: string | null;
          sent_by: string | null;
          status: string;
          submission_id: number | null;
          submitted_at: string | null;
          updated_at: string;
        };
        Insert: {
          company_id: number;
          created_at?: string;
          due_date?: string | null;
          id?: never;
          invite_id?: number | null;
          last_reminder_at?: string | null;
          message?: string | null;
          organization_id: string;
          period_quarter?: number | null;
          period_year: number;
          public_id?: string;
          request_type: string;
          sent_at?: string | null;
          sent_by?: string | null;
          status?: string;
          submission_id?: number | null;
          submitted_at?: string | null;
          updated_at?: string;
        };
        Update: {
          company_id?: number;
          created_at?: string;
          due_date?: string | null;
          id?: never;
          invite_id?: number | null;
          last_reminder_at?: string | null;
          message?: string | null;
          organization_id?: string;
          period_quarter?: number | null;
          period_year?: number;
          public_id?: string;
          request_type?: string;
          sent_at?: string | null;
          sent_by?: string | null;
          status?: string;
          submission_id?: number | null;
          submitted_at?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'inv_reporting_request_company_id_fkey';
            columns: ['company_id'];
            isOneToOne: false;
            referencedRelation: 'inv_company';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'inv_reporting_request_company_id_fkey';
            columns: ['company_id'];
            isOneToOne: false;
            referencedRelation: 'v_inv_company_valuation';
            referencedColumns: ['company_id'];
          },
          {
            foreignKeyName: 'inv_reporting_request_company_id_fkey';
            columns: ['company_id'];
            isOneToOne: false;
            referencedRelation: 'v_inv_info_rights_schedule';
            referencedColumns: ['company_id'];
          },
          {
            foreignKeyName: 'inv_reporting_request_invite_id_fkey';
            columns: ['invite_id'];
            isOneToOne: false;
            referencedRelation: 'app_invites';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'inv_reporting_request_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'mcp_distinct_orgs';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'inv_reporting_request_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'inv_reporting_request_sent_by_fkey';
            columns: ['sent_by'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'inv_reporting_request_submission_org_fk';
            columns: ['submission_id', 'organization_id'];
            isOneToOne: false;
            referencedRelation: 'inv_reporting_submission';
            referencedColumns: ['id', 'organization_id'];
          },
        ];
      };
      inv_reporting_request_document: {
        Row: {
          created_at: string;
          custom_doc_type: string | null;
          doc_type_id: number | null;
          id: number;
          note: string | null;
          organization_id: string;
          request_id: number;
          sort_order: number;
        };
        Insert: {
          created_at?: string;
          custom_doc_type?: string | null;
          doc_type_id?: number | null;
          id?: never;
          note?: string | null;
          organization_id: string;
          request_id: number;
          sort_order?: number;
        };
        Update: {
          created_at?: string;
          custom_doc_type?: string | null;
          doc_type_id?: number | null;
          id?: never;
          note?: string | null;
          organization_id?: string;
          request_id?: number;
          sort_order?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'inv_reporting_request_document_doc_type_id_fkey';
            columns: ['doc_type_id'];
            isOneToOne: false;
            referencedRelation: 'inv_reporting_doc_type';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'inv_reporting_request_document_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'mcp_distinct_orgs';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'inv_reporting_request_document_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'inv_reporting_request_document_request_id_fkey';
            columns: ['request_id'];
            isOneToOne: false;
            referencedRelation: 'inv_reporting_request';
            referencedColumns: ['id'];
          },
        ];
      };
      inv_reporting_request_kpi: {
        Row: {
          created_at: string;
          id: number;
          kpi_id: number;
          organization_id: string;
          request_id: number;
          sort_order: number;
        };
        Insert: {
          created_at?: string;
          id?: never;
          kpi_id: number;
          organization_id: string;
          request_id: number;
          sort_order?: number;
        };
        Update: {
          created_at?: string;
          id?: never;
          kpi_id?: number;
          organization_id?: string;
          request_id?: number;
          sort_order?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'inv_reporting_request_kpi_kpi_fk';
            columns: ['kpi_id'];
            isOneToOne: false;
            referencedRelation: 'inv_kpi';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'inv_reporting_request_kpi_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'mcp_distinct_orgs';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'inv_reporting_request_kpi_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'inv_reporting_request_kpi_request_id_fkey';
            columns: ['request_id'];
            isOneToOne: false;
            referencedRelation: 'inv_reporting_request';
            referencedColumns: ['id'];
          },
        ];
      };
      inv_reporting_request_recipient: {
        Row: {
          created_at: string;
          email: string;
          id: number;
          invited_at: string;
          invited_by: string | null;
          organization_id: string;
          request_id: number;
          user_id: string | null;
        };
        Insert: {
          created_at?: string;
          email: string;
          id?: never;
          invited_at?: string;
          invited_by?: string | null;
          organization_id: string;
          request_id: number;
          user_id?: string | null;
        };
        Update: {
          created_at?: string;
          email?: string;
          id?: never;
          invited_at?: string;
          invited_by?: string | null;
          organization_id?: string;
          request_id?: number;
          user_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'inv_reporting_request_recipient_invited_by_fkey';
            columns: ['invited_by'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'inv_reporting_request_recipient_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'mcp_distinct_orgs';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'inv_reporting_request_recipient_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'inv_reporting_request_recipient_request_org_fk';
            columns: ['request_id', 'organization_id'];
            isOneToOne: false;
            referencedRelation: 'inv_reporting_request';
            referencedColumns: ['id', 'organization_id'];
          },
          {
            foreignKeyName: 'inv_reporting_request_recipient_user_id_fkey1';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
        ];
      };
      inv_reporting_submission: {
        Row: {
          company_id: number;
          created_at: string;
          id: number;
          organization_id: string;
          period_quarter: number | null;
          period_year: number;
          public_id: string;
          status: string;
          submitted_at: string | null;
          submitted_by: string | null;
          type: string;
          updated_at: string;
        };
        Insert: {
          company_id: number;
          created_at?: string;
          id?: never;
          organization_id: string;
          period_quarter?: number | null;
          period_year: number;
          public_id?: string;
          status?: string;
          submitted_at?: string | null;
          submitted_by?: string | null;
          type: string;
          updated_at?: string;
        };
        Update: {
          company_id?: number;
          created_at?: string;
          id?: never;
          organization_id?: string;
          period_quarter?: number | null;
          period_year?: number;
          public_id?: string;
          status?: string;
          submitted_at?: string | null;
          submitted_by?: string | null;
          type?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'inv_reporting_submission_company_org_fk';
            columns: ['company_id', 'organization_id'];
            isOneToOne: false;
            referencedRelation: 'inv_company';
            referencedColumns: ['id', 'organization_id'];
          },
          {
            foreignKeyName: 'inv_reporting_submission_company_org_fk';
            columns: ['company_id', 'organization_id'];
            isOneToOne: false;
            referencedRelation: 'v_inv_company_valuation';
            referencedColumns: ['company_id', 'organization_id'];
          },
          {
            foreignKeyName: 'inv_reporting_submission_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'mcp_distinct_orgs';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'inv_reporting_submission_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'inv_reporting_submission_submitted_by_fkey';
            columns: ['submitted_by'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
        ];
      };
      inv_round_terms: {
        Row: {
          created_at: string;
          do_insurance: boolean | null;
          drag_along: boolean | null;
          effective_date: string;
          employee_vesting_protocol: boolean | null;
          external_id: string | null;
          financing_round_id: number;
          founder_vesting_applied: boolean | null;
          id: number;
          investor_counsel_fee_cap: number | null;
          investors_subject_to_rofr: boolean | null;
          issuer_pays_investor_counsel: boolean | null;
          major_investor_threshold_amount: number | null;
          major_investor_threshold_ownership_pct: number | null;
          major_investor_threshold_shares: number | null;
          milestone_closings: boolean | null;
          named_major_investors: string[] | null;
          option_pool_percent: number | null;
          organization_id: string;
          pay_to_play: boolean | null;
          post_money_fd_shares: number | null;
          pre_money_fd_shares: number | null;
          pro_rata_rights_all: boolean | null;
          pro_rata_rights_major: boolean | null;
          qsbs_covenant_given: boolean | null;
          qsbs_rep_made: boolean | null;
          raw_terms: Json;
          redemption_rights: boolean | null;
          registration_rights_preferred: boolean | null;
          required_closing_payments: boolean | null;
          rofr_cosale: boolean | null;
          standard_pro_rata_formulation: boolean | null;
          subsequent_closing_window_days: number | null;
          superseded_date: string | null;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          do_insurance?: boolean | null;
          drag_along?: boolean | null;
          effective_date: string;
          employee_vesting_protocol?: boolean | null;
          external_id?: string | null;
          financing_round_id: number;
          founder_vesting_applied?: boolean | null;
          id?: never;
          investor_counsel_fee_cap?: number | null;
          investors_subject_to_rofr?: boolean | null;
          issuer_pays_investor_counsel?: boolean | null;
          major_investor_threshold_amount?: number | null;
          major_investor_threshold_ownership_pct?: number | null;
          major_investor_threshold_shares?: number | null;
          milestone_closings?: boolean | null;
          named_major_investors?: string[] | null;
          option_pool_percent?: number | null;
          organization_id: string;
          pay_to_play?: boolean | null;
          post_money_fd_shares?: number | null;
          pre_money_fd_shares?: number | null;
          pro_rata_rights_all?: boolean | null;
          pro_rata_rights_major?: boolean | null;
          qsbs_covenant_given?: boolean | null;
          qsbs_rep_made?: boolean | null;
          raw_terms?: Json;
          redemption_rights?: boolean | null;
          registration_rights_preferred?: boolean | null;
          required_closing_payments?: boolean | null;
          rofr_cosale?: boolean | null;
          standard_pro_rata_formulation?: boolean | null;
          subsequent_closing_window_days?: number | null;
          superseded_date?: string | null;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          do_insurance?: boolean | null;
          drag_along?: boolean | null;
          effective_date?: string;
          employee_vesting_protocol?: boolean | null;
          external_id?: string | null;
          financing_round_id?: number;
          founder_vesting_applied?: boolean | null;
          id?: never;
          investor_counsel_fee_cap?: number | null;
          investors_subject_to_rofr?: boolean | null;
          issuer_pays_investor_counsel?: boolean | null;
          major_investor_threshold_amount?: number | null;
          major_investor_threshold_ownership_pct?: number | null;
          major_investor_threshold_shares?: number | null;
          milestone_closings?: boolean | null;
          named_major_investors?: string[] | null;
          option_pool_percent?: number | null;
          organization_id?: string;
          pay_to_play?: boolean | null;
          post_money_fd_shares?: number | null;
          pre_money_fd_shares?: number | null;
          pro_rata_rights_all?: boolean | null;
          pro_rata_rights_major?: boolean | null;
          qsbs_covenant_given?: boolean | null;
          qsbs_rep_made?: boolean | null;
          raw_terms?: Json;
          redemption_rights?: boolean | null;
          registration_rights_preferred?: boolean | null;
          required_closing_payments?: boolean | null;
          rofr_cosale?: boolean | null;
          standard_pro_rata_formulation?: boolean | null;
          subsequent_closing_window_days?: number | null;
          superseded_date?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'inv_round_terms_financing_round_id_fkey';
            columns: ['financing_round_id'];
            isOneToOne: false;
            referencedRelation: 'inv_financing_round';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'inv_round_terms_financing_round_id_fkey';
            columns: ['financing_round_id'];
            isOneToOne: false;
            referencedRelation: 'v_inv_round_totals';
            referencedColumns: ['financing_round_id'];
          },
          {
            foreignKeyName: 'inv_round_terms_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'mcp_distinct_orgs';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'inv_round_terms_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
        ];
      };
      inv_security: {
        Row: {
          company_id: number;
          created_at: string;
          external_id: string | null;
          id: number;
          is_valuation_reference: boolean;
          metadata: Json;
          name: string;
          organization_id: string;
          public_id: string;
          security_type: string;
          series_name: string | null;
          updated_at: string;
        };
        Insert: {
          company_id: number;
          created_at?: string;
          external_id?: string | null;
          id?: never;
          is_valuation_reference?: boolean;
          metadata?: Json;
          name: string;
          organization_id: string;
          public_id?: string;
          security_type: string;
          series_name?: string | null;
          updated_at?: string;
        };
        Update: {
          company_id?: number;
          created_at?: string;
          external_id?: string | null;
          id?: never;
          is_valuation_reference?: boolean;
          metadata?: Json;
          name?: string;
          organization_id?: string;
          public_id?: string;
          security_type?: string;
          series_name?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'inv_security_company_id_fkey';
            columns: ['company_id'];
            isOneToOne: false;
            referencedRelation: 'inv_company';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'inv_security_company_id_fkey';
            columns: ['company_id'];
            isOneToOne: false;
            referencedRelation: 'v_inv_company_valuation';
            referencedColumns: ['company_id'];
          },
          {
            foreignKeyName: 'inv_security_company_id_fkey';
            columns: ['company_id'];
            isOneToOne: false;
            referencedRelation: 'v_inv_info_rights_schedule';
            referencedColumns: ['company_id'];
          },
          {
            foreignKeyName: 'inv_security_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'mcp_distinct_orgs';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'inv_security_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
        ];
      };
      inv_security_terms: {
        Row: {
          aggregate_liq_pref: number | null;
          anti_dilution_type: string | null;
          authorized_shares: number | null;
          conversion_price: number | null;
          conversion_ratio: number | null;
          created_at: string;
          discount_rate: number | null;
          dividend_accruing: boolean | null;
          dividend_cumulative: boolean | null;
          dividend_rate: number | null;
          dividend_seniority: number | null;
          effective_date: string;
          external_id: string | null;
          id: number;
          interest_rate: number | null;
          interest_type: string | null;
          issued_shares: number | null;
          liquidation_multiplier: number | null;
          liquidation_seniority: number | null;
          maturity_date: string | null;
          organization_id: string;
          original_issue_price: number | null;
          outstanding_shares: number | null;
          par_value: number | null;
          participation_cap: number | null;
          participation_type: string | null;
          qualified_financing_threshold: number | null;
          raw_terms: Json;
          security_id: number;
          superseded_date: string | null;
          updated_at: string;
          valuation_cap: number | null;
        };
        Insert: {
          aggregate_liq_pref?: number | null;
          anti_dilution_type?: string | null;
          authorized_shares?: number | null;
          conversion_price?: number | null;
          conversion_ratio?: number | null;
          created_at?: string;
          discount_rate?: number | null;
          dividend_accruing?: boolean | null;
          dividend_cumulative?: boolean | null;
          dividend_rate?: number | null;
          dividend_seniority?: number | null;
          effective_date: string;
          external_id?: string | null;
          id?: never;
          interest_rate?: number | null;
          interest_type?: string | null;
          issued_shares?: number | null;
          liquidation_multiplier?: number | null;
          liquidation_seniority?: number | null;
          maturity_date?: string | null;
          organization_id: string;
          original_issue_price?: number | null;
          outstanding_shares?: number | null;
          par_value?: number | null;
          participation_cap?: number | null;
          participation_type?: string | null;
          qualified_financing_threshold?: number | null;
          raw_terms?: Json;
          security_id: number;
          superseded_date?: string | null;
          updated_at?: string;
          valuation_cap?: number | null;
        };
        Update: {
          aggregate_liq_pref?: number | null;
          anti_dilution_type?: string | null;
          authorized_shares?: number | null;
          conversion_price?: number | null;
          conversion_ratio?: number | null;
          created_at?: string;
          discount_rate?: number | null;
          dividend_accruing?: boolean | null;
          dividend_cumulative?: boolean | null;
          dividend_rate?: number | null;
          dividend_seniority?: number | null;
          effective_date?: string;
          external_id?: string | null;
          id?: never;
          interest_rate?: number | null;
          interest_type?: string | null;
          issued_shares?: number | null;
          liquidation_multiplier?: number | null;
          liquidation_seniority?: number | null;
          maturity_date?: string | null;
          organization_id?: string;
          original_issue_price?: number | null;
          outstanding_shares?: number | null;
          par_value?: number | null;
          participation_cap?: number | null;
          participation_type?: string | null;
          qualified_financing_threshold?: number | null;
          raw_terms?: Json;
          security_id?: number;
          superseded_date?: string | null;
          updated_at?: string;
          valuation_cap?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: 'inv_security_terms_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'mcp_distinct_orgs';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'inv_security_terms_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'inv_security_terms_security_id_fkey';
            columns: ['security_id'];
            isOneToOne: false;
            referencedRelation: 'inv_security';
            referencedColumns: ['id'];
          },
        ];
      };
      inv_snapshot_types: {
        Row: {
          code: string;
          created_at: string;
          display_name: string;
          id: number;
          sort_order: number;
        };
        Insert: {
          code: string;
          created_at?: string;
          display_name: string;
          id?: never;
          sort_order: number;
        };
        Update: {
          code?: string;
          created_at?: string;
          display_name?: string;
          id?: never;
          sort_order?: number;
        };
        Relationships: [];
      };
      inv_stages: {
        Row: {
          code: string;
          created_at: string;
          display_name: string;
          id: number;
          sort_order: number;
        };
        Insert: {
          code: string;
          created_at?: string;
          display_name: string;
          id?: never;
          sort_order: number;
        };
        Update: {
          code?: string;
          created_at?: string;
          display_name?: string;
          id?: never;
          sort_order?: number;
        };
        Relationships: [];
      };
      inv_transaction: {
        Row: {
          amount: number;
          company_id: number;
          counterparty_name: string | null;
          created_at: string;
          currency: string;
          external_id: string | null;
          financing_round_id: number | null;
          fund_id: number;
          id: number;
          metadata: Json;
          notes: string | null;
          organization_id: string;
          public_id: string;
          security_id: number;
          settlement_date: string | null;
          signatory: string | null;
          transaction_date: string;
          transaction_type: string;
          units: number;
          updated_at: string;
        };
        Insert: {
          amount: number;
          company_id: number;
          counterparty_name?: string | null;
          created_at?: string;
          currency?: string;
          external_id?: string | null;
          financing_round_id?: number | null;
          fund_id: number;
          id?: never;
          metadata?: Json;
          notes?: string | null;
          organization_id: string;
          public_id?: string;
          security_id: number;
          settlement_date?: string | null;
          signatory?: string | null;
          transaction_date: string;
          transaction_type: string;
          units: number;
          updated_at?: string;
        };
        Update: {
          amount?: number;
          company_id?: number;
          counterparty_name?: string | null;
          created_at?: string;
          currency?: string;
          external_id?: string | null;
          financing_round_id?: number | null;
          fund_id?: number;
          id?: never;
          metadata?: Json;
          notes?: string | null;
          organization_id?: string;
          public_id?: string;
          security_id?: number;
          settlement_date?: string | null;
          signatory?: string | null;
          transaction_date?: string;
          transaction_type?: string;
          units?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'inv_transaction_company_id_fkey';
            columns: ['company_id'];
            isOneToOne: false;
            referencedRelation: 'inv_company';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'inv_transaction_company_id_fkey';
            columns: ['company_id'];
            isOneToOne: false;
            referencedRelation: 'v_inv_company_valuation';
            referencedColumns: ['company_id'];
          },
          {
            foreignKeyName: 'inv_transaction_company_id_fkey';
            columns: ['company_id'];
            isOneToOne: false;
            referencedRelation: 'v_inv_info_rights_schedule';
            referencedColumns: ['company_id'];
          },
          {
            foreignKeyName: 'inv_transaction_financing_round_id_fkey';
            columns: ['financing_round_id'];
            isOneToOne: false;
            referencedRelation: 'inv_financing_round';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'inv_transaction_financing_round_id_fkey';
            columns: ['financing_round_id'];
            isOneToOne: false;
            referencedRelation: 'v_inv_round_totals';
            referencedColumns: ['financing_round_id'];
          },
          {
            foreignKeyName: 'inv_transaction_fund_id_fkey';
            columns: ['fund_id'];
            isOneToOne: false;
            referencedRelation: 'inv_fund';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'inv_transaction_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'mcp_distinct_orgs';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'inv_transaction_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'inv_transaction_security_id_fkey';
            columns: ['security_id'];
            isOneToOne: false;
            referencedRelation: 'inv_security';
            referencedColumns: ['id'];
          },
        ];
      };
      inv_transaction_agreement: {
        Row: {
          agreement_date: string | null;
          company_id: number;
          created_at: string;
          defined_name: string;
          document_type: string | null;
          external_id: string | null;
          financing_round_id: number | null;
          id: number;
          metadata: Json;
          module_document_id: number;
          organization_id: string;
          updated_at: string;
        };
        Insert: {
          agreement_date?: string | null;
          company_id: number;
          created_at?: string;
          defined_name: string;
          document_type?: string | null;
          external_id?: string | null;
          financing_round_id?: number | null;
          id?: never;
          metadata?: Json;
          module_document_id: number;
          organization_id: string;
          updated_at?: string;
        };
        Update: {
          agreement_date?: string | null;
          company_id?: number;
          created_at?: string;
          defined_name?: string;
          document_type?: string | null;
          external_id?: string | null;
          financing_round_id?: number | null;
          id?: never;
          metadata?: Json;
          module_document_id?: number;
          organization_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'inv_transaction_agreement_company_id_fkey';
            columns: ['company_id'];
            isOneToOne: false;
            referencedRelation: 'inv_company';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'inv_transaction_agreement_company_id_fkey';
            columns: ['company_id'];
            isOneToOne: false;
            referencedRelation: 'v_inv_company_valuation';
            referencedColumns: ['company_id'];
          },
          {
            foreignKeyName: 'inv_transaction_agreement_company_id_fkey';
            columns: ['company_id'];
            isOneToOne: false;
            referencedRelation: 'v_inv_info_rights_schedule';
            referencedColumns: ['company_id'];
          },
          {
            foreignKeyName: 'inv_transaction_agreement_financing_round_id_fkey';
            columns: ['financing_round_id'];
            isOneToOne: false;
            referencedRelation: 'inv_financing_round';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'inv_transaction_agreement_financing_round_id_fkey';
            columns: ['financing_round_id'];
            isOneToOne: false;
            referencedRelation: 'v_inv_round_totals';
            referencedColumns: ['financing_round_id'];
          },
          {
            foreignKeyName: 'inv_transaction_agreement_module_document_id_fkey';
            columns: ['module_document_id'];
            isOneToOne: false;
            referencedRelation: 'module_documents';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'inv_transaction_agreement_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'mcp_distinct_orgs';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'inv_transaction_agreement_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
        ];
      };
      inv_value_overrides: {
        Row: {
          created_at: string;
          created_by: string;
          entity_id: number;
          entity_type: string;
          field_key: string;
          id: string;
          organization_id: string;
          original_value: Json;
          override_value: Json;
          reason: string;
          reverted_at: string | null;
          reverted_by: string | null;
        };
        Insert: {
          created_at?: string;
          created_by: string;
          entity_id: number;
          entity_type: string;
          field_key: string;
          id?: string;
          organization_id: string;
          original_value: Json;
          override_value: Json;
          reason: string;
          reverted_at?: string | null;
          reverted_by?: string | null;
        };
        Update: {
          created_at?: string;
          created_by?: string;
          entity_id?: number;
          entity_type?: string;
          field_key?: string;
          id?: string;
          organization_id?: string;
          original_value?: Json;
          override_value?: Json;
          reason?: string;
          reverted_at?: string | null;
          reverted_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'inv_value_overrides_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'inv_value_overrides_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'mcp_distinct_orgs';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'inv_value_overrides_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'inv_value_overrides_reverted_by_fkey';
            columns: ['reverted_by'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
        ];
      };
      investor_board_representation: {
        Row: {
          created_at: string;
          designating_party_id: number | null;
          designating_security_id: number | null;
          effective_date: string | null;
          end_date: string | null;
          entity_id: number;
          id: number;
          party_id: number;
          seat_type: string | null;
          seat_type_id: number | null;
          source_document_id: number | null;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          designating_party_id?: number | null;
          designating_security_id?: number | null;
          effective_date?: string | null;
          end_date?: string | null;
          entity_id: number;
          id?: number;
          party_id: number;
          seat_type?: string | null;
          seat_type_id?: number | null;
          source_document_id?: number | null;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          designating_party_id?: number | null;
          designating_security_id?: number | null;
          effective_date?: string | null;
          end_date?: string | null;
          entity_id?: number;
          id?: number;
          party_id?: number;
          seat_type?: string | null;
          seat_type_id?: number | null;
          source_document_id?: number | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'investor_board_representation_designating_party_id_fkey';
            columns: ['designating_party_id'];
            isOneToOne: false;
            referencedRelation: 'investor_party';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'investor_board_representation_designating_security_id_fkey';
            columns: ['designating_security_id'];
            isOneToOne: false;
            referencedRelation: 'investor_security';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'investor_board_representation_entity_id_fkey';
            columns: ['entity_id'];
            isOneToOne: false;
            referencedRelation: 'module_entities';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'investor_board_representation_party_id_fkey';
            columns: ['party_id'];
            isOneToOne: false;
            referencedRelation: 'investor_party';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'investor_board_representation_seat_type_id_fkey';
            columns: ['seat_type_id'];
            isOneToOne: false;
            referencedRelation: 'investor_seat_types';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'investor_board_representation_source_document_id_fkey';
            columns: ['source_document_id'];
            isOneToOne: false;
            referencedRelation: 'module_document_files';
            referencedColumns: ['id'];
          },
        ];
      };
      investor_closing: {
        Row: {
          close_date: string;
          closing_label: string | null;
          created_at: string;
          currency: string;
          event_id: number;
          id: number;
          post_money_valuation: number | null;
          posting_key: string | null;
          source_document_id: number | null;
          total_raised: number | null;
          updated_at: string;
        };
        Insert: {
          close_date: string;
          closing_label?: string | null;
          created_at?: string;
          currency?: string;
          event_id: number;
          id?: number;
          post_money_valuation?: number | null;
          posting_key?: string | null;
          source_document_id?: number | null;
          total_raised?: number | null;
          updated_at?: string;
        };
        Update: {
          close_date?: string;
          closing_label?: string | null;
          created_at?: string;
          currency?: string;
          event_id?: number;
          id?: number;
          post_money_valuation?: number | null;
          posting_key?: string | null;
          source_document_id?: number | null;
          total_raised?: number | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'investor_closing_event_id_fkey';
            columns: ['event_id'];
            isOneToOne: false;
            referencedRelation: 'investor_financing_event';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'investor_closing_source_document_id_fkey';
            columns: ['source_document_id'];
            isOneToOne: false;
            referencedRelation: 'module_document_files';
            referencedColumns: ['id'];
          },
        ];
      };
      investor_closing_participant: {
        Row: {
          amount_paid: number | null;
          closing_id: number;
          created_at: string;
          id: number;
          party_id: number;
          role: string | null;
          security_id: number;
          shares_purchased: number | null;
          source_document_id: number | null;
          transaction_type_id: number;
          updated_at: string;
        };
        Insert: {
          amount_paid?: number | null;
          closing_id: number;
          created_at?: string;
          id?: number;
          party_id: number;
          role?: string | null;
          security_id: number;
          shares_purchased?: number | null;
          source_document_id?: number | null;
          transaction_type_id: number;
          updated_at?: string;
        };
        Update: {
          amount_paid?: number | null;
          closing_id?: number;
          created_at?: string;
          id?: number;
          party_id?: number;
          role?: string | null;
          security_id?: number;
          shares_purchased?: number | null;
          source_document_id?: number | null;
          transaction_type_id?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'fk_icp_transaction_type';
            columns: ['transaction_type_id'];
            isOneToOne: false;
            referencedRelation: 'investor_transaction_types';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'investor_closing_participant_closing_id_fkey';
            columns: ['closing_id'];
            isOneToOne: false;
            referencedRelation: 'investor_closing';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'investor_closing_participant_party_id_fkey';
            columns: ['party_id'];
            isOneToOne: false;
            referencedRelation: 'investor_party';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'investor_closing_participant_security_id_fkey';
            columns: ['security_id'];
            isOneToOne: false;
            referencedRelation: 'investor_security';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'investor_closing_participant_source_document_id_fkey';
            columns: ['source_document_id'];
            isOneToOne: false;
            referencedRelation: 'module_document_files';
            referencedColumns: ['id'];
          },
        ];
      };
      investor_convertible_instruments: {
        Row: {
          created_at: string;
          discount_rate: number | null;
          entity_id: number;
          id: number;
          instrument_type_id: number | null;
          issue_date: string | null;
          party_id: number | null;
          principal_amount: number | null;
          source_document_id: number | null;
          updated_at: string;
          valuation_cap: number | null;
        };
        Insert: {
          created_at?: string;
          discount_rate?: number | null;
          entity_id: number;
          id?: number;
          instrument_type_id?: number | null;
          issue_date?: string | null;
          party_id?: number | null;
          principal_amount?: number | null;
          source_document_id?: number | null;
          updated_at?: string;
          valuation_cap?: number | null;
        };
        Update: {
          created_at?: string;
          discount_rate?: number | null;
          entity_id?: number;
          id?: number;
          instrument_type_id?: number | null;
          issue_date?: string | null;
          party_id?: number | null;
          principal_amount?: number | null;
          source_document_id?: number | null;
          updated_at?: string;
          valuation_cap?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: 'investor_convertible_instruments_entity_id_fkey';
            columns: ['entity_id'];
            isOneToOne: false;
            referencedRelation: 'module_entities';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'investor_convertible_instruments_instrument_type_id_fkey';
            columns: ['instrument_type_id'];
            isOneToOne: false;
            referencedRelation: 'investor_instrument_types';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'investor_convertible_instruments_party_id_fkey';
            columns: ['party_id'];
            isOneToOne: false;
            referencedRelation: 'investor_party';
            referencedColumns: ['id'];
          },
        ];
      };
      investor_equity_plan: {
        Row: {
          adoption_date: string;
          created_at: string;
          entity_id: number;
          expiration_date: string | null;
          id: number;
          name: string;
        };
        Insert: {
          adoption_date: string;
          created_at?: string;
          entity_id: number;
          expiration_date?: string | null;
          id?: number;
          name: string;
        };
        Update: {
          adoption_date?: string;
          created_at?: string;
          entity_id?: number;
          expiration_date?: string | null;
          id?: number;
          name?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'investor_equity_plan_entity_id_fkey';
            columns: ['entity_id'];
            isOneToOne: false;
            referencedRelation: 'module_entities';
            referencedColumns: ['id'];
          },
        ];
      };
      investor_equity_plan_version: {
        Row: {
          authorized_pool_shares: number | null;
          available_shares: number | null;
          effective_date: string;
          id: number;
          outstanding_options: number | null;
          plan_id: number;
          source_document_id: number | null;
        };
        Insert: {
          authorized_pool_shares?: number | null;
          available_shares?: number | null;
          effective_date: string;
          id?: number;
          outstanding_options?: number | null;
          plan_id: number;
          source_document_id?: number | null;
        };
        Update: {
          authorized_pool_shares?: number | null;
          available_shares?: number | null;
          effective_date?: string;
          id?: number;
          outstanding_options?: number | null;
          plan_id?: number;
          source_document_id?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: 'investor_equity_plan_version_plan_id_fkey';
            columns: ['plan_id'];
            isOneToOne: false;
            referencedRelation: 'investor_equity_plan';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'investor_equity_plan_version_source_document_id_fkey';
            columns: ['source_document_id'];
            isOneToOne: false;
            referencedRelation: 'module_document_files';
            referencedColumns: ['id'];
          },
        ];
      };
      investor_events: {
        Row: {
          created_at: string;
          description: string | null;
          display_name: string;
          event_key: string;
          id: number;
        };
        Insert: {
          created_at?: string;
          description?: string | null;
          display_name: string;
          event_key: string;
          id?: number;
        };
        Update: {
          created_at?: string;
          description?: string | null;
          display_name?: string;
          event_key?: string;
          id?: number;
        };
        Relationships: [];
      };
      investor_financing_event: {
        Row: {
          announced_date: string | null;
          created_at: string;
          currency: string;
          entity_id: number;
          event_type_id: number | null;
          id: number;
          notes: string | null;
          pre_money_valuation: number | null;
          source_document_id: number | null;
          stage_id: number | null;
          updated_at: string;
        };
        Insert: {
          announced_date?: string | null;
          created_at?: string;
          currency?: string;
          entity_id: number;
          event_type_id?: number | null;
          id?: number;
          notes?: string | null;
          pre_money_valuation?: number | null;
          source_document_id?: number | null;
          stage_id?: number | null;
          updated_at?: string;
        };
        Update: {
          announced_date?: string | null;
          created_at?: string;
          currency?: string;
          entity_id?: number;
          event_type_id?: number | null;
          id?: number;
          notes?: string | null;
          pre_money_valuation?: number | null;
          source_document_id?: number | null;
          stage_id?: number | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'investor_financing_event_entity_id_fkey';
            columns: ['entity_id'];
            isOneToOne: false;
            referencedRelation: 'module_entities';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'investor_financing_event_event_type_id_fkey';
            columns: ['event_type_id'];
            isOneToOne: false;
            referencedRelation: 'investor_events';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'investor_financing_event_source_document_id_fkey';
            columns: ['source_document_id'];
            isOneToOne: false;
            referencedRelation: 'module_document_files';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'investor_financing_event_stage_id_fkey';
            columns: ['stage_id'];
            isOneToOne: false;
            referencedRelation: 'investor_stages';
            referencedColumns: ['id'];
          },
        ];
      };
      investor_funds: {
        Row: {
          code: string;
          created_at: string;
          id: number;
          name: string;
          organization_id: string;
          public_id: string;
          short_name: string;
          status: string;
          updated_at: string;
        };
        Insert: {
          code: string;
          created_at?: string;
          id?: number;
          name: string;
          organization_id: string;
          public_id?: string;
          short_name: string;
          status?: string;
          updated_at?: string;
        };
        Update: {
          code?: string;
          created_at?: string;
          id?: number;
          name?: string;
          organization_id?: string;
          public_id?: string;
          short_name?: string;
          status?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'investor_funds_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'mcp_distinct_orgs';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'investor_funds_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
        ];
      };
      investor_instrument_types: {
        Row: {
          code: string;
          created_at: string;
          description: string | null;
          id: number;
          label: string;
        };
        Insert: {
          code: string;
          created_at?: string;
          description?: string | null;
          id?: number;
          label: string;
        };
        Update: {
          code?: string;
          created_at?: string;
          description?: string | null;
          id?: number;
          label?: string;
        };
        Relationships: [];
      };
      investor_party: {
        Row: {
          created_at: string;
          email: string | null;
          id: number;
          is_self: boolean;
          metadata: Json;
          name: string;
          organization_id: string;
          party_type: string | null;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          email?: string | null;
          id?: number;
          is_self?: boolean;
          metadata?: Json;
          name: string;
          organization_id: string;
          party_type?: string | null;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          email?: string | null;
          id?: number;
          is_self?: boolean;
          metadata?: Json;
          name?: string;
          organization_id?: string;
          party_type?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'investor_party_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'mcp_distinct_orgs';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'investor_party_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
        ];
      };
      investor_position_lot: {
        Row: {
          acquired_date: string;
          cost_per_unit: number | null;
          created_at: string;
          currency: string;
          id: number;
          party_id: number;
          security_id: number;
          source_closing_id: number;
          source_document_id: number | null;
          total_cost: number | null;
          units: number | null;
          updated_at: string;
        };
        Insert: {
          acquired_date: string;
          cost_per_unit?: number | null;
          created_at?: string;
          currency?: string;
          id?: number;
          party_id: number;
          security_id: number;
          source_closing_id: number;
          source_document_id?: number | null;
          total_cost?: number | null;
          units?: number | null;
          updated_at?: string;
        };
        Update: {
          acquired_date?: string;
          cost_per_unit?: number | null;
          created_at?: string;
          currency?: string;
          id?: number;
          party_id?: number;
          security_id?: number;
          source_closing_id?: number;
          source_document_id?: number | null;
          total_cost?: number | null;
          units?: number | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'investor_position_lot_party_id_fkey';
            columns: ['party_id'];
            isOneToOne: false;
            referencedRelation: 'investor_party';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'investor_position_lot_security_id_fkey';
            columns: ['security_id'];
            isOneToOne: false;
            referencedRelation: 'investor_security';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'investor_position_lot_source_closing_id_fkey';
            columns: ['source_closing_id'];
            isOneToOne: false;
            referencedRelation: 'investor_closing';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'investor_position_lot_source_document_id_fkey';
            columns: ['source_document_id'];
            isOneToOne: false;
            referencedRelation: 'module_document_files';
            referencedColumns: ['id'];
          },
        ];
      };
      investor_seat_types: {
        Row: {
          code: string;
          created_at: string;
          description: string | null;
          id: number;
          label: string;
        };
        Insert: {
          code: string;
          created_at?: string;
          description?: string | null;
          id?: number;
          label: string;
        };
        Update: {
          code?: string;
          created_at?: string;
          description?: string | null;
          id?: number;
          label?: string;
        };
        Relationships: [];
      };
      investor_security: {
        Row: {
          created_at: string;
          entity_id: number;
          id: number;
          is_valuation_reference: boolean | null;
          security_type: string;
          series_name: string | null;
          source_document_id: number | null;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          entity_id: number;
          id?: number;
          is_valuation_reference?: boolean | null;
          security_type: string;
          series_name?: string | null;
          source_document_id?: number | null;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          entity_id?: number;
          id?: number;
          is_valuation_reference?: boolean | null;
          security_type?: string;
          series_name?: string | null;
          source_document_id?: number | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'investor_security_entity_id_fkey';
            columns: ['entity_id'];
            isOneToOne: false;
            referencedRelation: 'module_entities';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'investor_security_source_document_id_fkey';
            columns: ['source_document_id'];
            isOneToOne: false;
            referencedRelation: 'module_document_files';
            referencedColumns: ['id'];
          },
        ];
      };
      investor_security_terms_version: {
        Row: {
          anti_dilution_type: string | null;
          authorized_shares: number | null;
          conversion_ratio: number | null;
          created_at: string;
          derived_from: Json;
          dividend_rate: number | null;
          effective_date: string;
          id: number;
          is_participating: boolean | null;
          liquidation_preference_multiple: number | null;
          original_issue_price: number | null;
          outstanding_shares: number | null;
          par_value: number | null;
          participation_cap: number | null;
          preference_order: number | null;
          security_id: number;
          source_document_id: number | null;
          terms: Json;
          updated_at: string;
        };
        Insert: {
          anti_dilution_type?: string | null;
          authorized_shares?: number | null;
          conversion_ratio?: number | null;
          created_at?: string;
          derived_from?: Json;
          dividend_rate?: number | null;
          effective_date: string;
          id?: number;
          is_participating?: boolean | null;
          liquidation_preference_multiple?: number | null;
          original_issue_price?: number | null;
          outstanding_shares?: number | null;
          par_value?: number | null;
          participation_cap?: number | null;
          preference_order?: number | null;
          security_id: number;
          source_document_id?: number | null;
          terms?: Json;
          updated_at?: string;
        };
        Update: {
          anti_dilution_type?: string | null;
          authorized_shares?: number | null;
          conversion_ratio?: number | null;
          created_at?: string;
          derived_from?: Json;
          dividend_rate?: number | null;
          effective_date?: string;
          id?: number;
          is_participating?: boolean | null;
          liquidation_preference_multiple?: number | null;
          original_issue_price?: number | null;
          outstanding_shares?: number | null;
          par_value?: number | null;
          participation_cap?: number | null;
          preference_order?: number | null;
          security_id?: number;
          source_document_id?: number | null;
          terms?: Json;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'investor_security_terms_version_security_id_fkey';
            columns: ['security_id'];
            isOneToOne: false;
            referencedRelation: 'investor_security';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'investor_security_terms_version_source_document_id_fkey';
            columns: ['source_document_id'];
            isOneToOne: false;
            referencedRelation: 'module_document_files';
            referencedColumns: ['id'];
          },
        ];
      };
      investor_stages: {
        Row: {
          created_at: string;
          display_name: string;
          id: number;
          stage_key: string;
        };
        Insert: {
          created_at?: string;
          display_name: string;
          id?: number;
          stage_key: string;
        };
        Update: {
          created_at?: string;
          display_name?: string;
          id?: number;
          stage_key?: string;
        };
        Relationships: [];
      };
      investor_transaction_types: {
        Row: {
          code: string;
          created_at: string;
          description: string | null;
          id: number;
        };
        Insert: {
          code: string;
          created_at?: string;
          description?: string | null;
          id?: number;
        };
        Update: {
          code?: string;
          created_at?: string;
          description?: string | null;
          id?: number;
        };
        Relationships: [];
      };
      master_field_definitions: {
        Row: {
          category: string | null;
          created_at: string;
          default_data_type: string;
          default_label: string;
          default_select_options: Json | null;
          default_tooltip_text: string | null;
          default_ui_component_hint: string | null;
          default_validation_rules: Json | null;
          field_key: string;
          id: string;
          prompt_template_group_id: string | null;
          required: boolean;
          settings: Json | null;
          tmp_ai_prompt: string | null;
          updated_at: string;
        };
        Insert: {
          category?: string | null;
          created_at?: string;
          default_data_type: string;
          default_label: string;
          default_select_options?: Json | null;
          default_tooltip_text?: string | null;
          default_ui_component_hint?: string | null;
          default_validation_rules?: Json | null;
          field_key: string;
          id?: string;
          prompt_template_group_id?: string | null;
          required?: boolean;
          settings?: Json | null;
          tmp_ai_prompt?: string | null;
          updated_at?: string;
        };
        Update: {
          category?: string | null;
          created_at?: string;
          default_data_type?: string;
          default_label?: string;
          default_select_options?: Json | null;
          default_tooltip_text?: string | null;
          default_ui_component_hint?: string | null;
          default_validation_rules?: Json | null;
          field_key?: string;
          id?: string;
          prompt_template_group_id?: string | null;
          required?: boolean;
          settings?: Json | null;
          tmp_ai_prompt?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'master_field_definitions_prompt_template_group_id_fkey';
            columns: ['prompt_template_group_id'];
            isOneToOne: false;
            referencedRelation: 'prompt_template_groups';
            referencedColumns: ['id'];
          },
        ];
      };
      mcp_api_tokens: {
        Row: {
          created_at: string;
          expires_at: string | null;
          id: string;
          module: string;
          name: string;
          organization_id: string;
          revoked_at: string | null;
          scopes: string[];
          token_encrypted: string | null;
          token_hash: string;
          token_prefix: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          expires_at?: string | null;
          id?: string;
          module: string;
          name: string;
          organization_id: string;
          revoked_at?: string | null;
          scopes?: string[];
          token_encrypted?: string | null;
          token_hash: string;
          token_prefix: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          expires_at?: string | null;
          id?: string;
          module?: string;
          name?: string;
          organization_id?: string;
          revoked_at?: string | null;
          scopes?: string[];
          token_encrypted?: string | null;
          token_hash?: string;
          token_prefix?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'mcp_api_tokens_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'mcp_distinct_orgs';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'mcp_api_tokens_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'mcp_api_tokens_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
        ];
      };
      mcp_oauth_grants: {
        Row: {
          client_id: string;
          created_at: string;
          id: string;
          module: string;
          revoked_at: string | null;
          scopes: string[];
          updated_at: string;
          user_id: string;
        };
        Insert: {
          client_id: string;
          created_at?: string;
          id?: string;
          module: string;
          revoked_at?: string | null;
          scopes?: string[];
          updated_at?: string;
          user_id: string;
        };
        Update: {
          client_id?: string;
          created_at?: string;
          id?: string;
          module?: string;
          revoked_at?: string | null;
          scopes?: string[];
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'mcp_oauth_grants_module_fkey';
            columns: ['module'];
            isOneToOne: false;
            referencedRelation: 'app_modules';
            referencedColumns: ['code'];
          },
        ];
      };
      mcp_tool_calls: {
        Row: {
          duration_ms: number;
          error_code: string | null;
          id: number;
          input_sample: Json | null;
          module: string | null;
          organization_id: string;
          output_sample: Json | null;
          request_bytes: number;
          response_bytes: number;
          scope: string | null;
          started_at: string;
          status: string;
          token_id: string | null;
          token_source: string | null;
          tool_name: string;
          user_id: string;
        };
        Insert: {
          duration_ms: number;
          error_code?: string | null;
          id?: number;
          input_sample?: Json | null;
          module?: string | null;
          organization_id: string;
          output_sample?: Json | null;
          request_bytes: number;
          response_bytes: number;
          scope?: string | null;
          started_at?: string;
          status: string;
          token_id?: string | null;
          token_source?: string | null;
          tool_name: string;
          user_id: string;
        };
        Update: {
          duration_ms?: number;
          error_code?: string | null;
          id?: number;
          input_sample?: Json | null;
          module?: string | null;
          organization_id?: string;
          output_sample?: Json | null;
          request_bytes?: number;
          response_bytes?: number;
          scope?: string | null;
          started_at?: string;
          status?: string;
          token_id?: string | null;
          token_source?: string | null;
          tool_name?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'mcp_tool_calls_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'mcp_distinct_orgs';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'mcp_tool_calls_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
        ];
      };
      module_archives: {
        Row: {
          created_at: string;
          file_hash: string | null;
          file_name: string;
          file_path: string;
          file_size: number | null;
          file_type: string | null;
          id: number;
          is_deleted: boolean | null;
          metadata: Json | null;
          module_id: number;
          organization_id: string;
          public_id: string | null;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          file_hash?: string | null;
          file_name: string;
          file_path: string;
          file_size?: number | null;
          file_type?: string | null;
          id?: number;
          is_deleted?: boolean | null;
          metadata?: Json | null;
          module_id: number;
          organization_id: string;
          public_id?: string | null;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          file_hash?: string | null;
          file_name?: string;
          file_path?: string;
          file_size?: number | null;
          file_type?: string | null;
          id?: number;
          is_deleted?: boolean | null;
          metadata?: Json | null;
          module_id?: number;
          organization_id?: string;
          public_id?: string | null;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'module_archives_module_id_fkey';
            columns: ['module_id'];
            isOneToOne: false;
            referencedRelation: 'app_modules';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'module_archives_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'mcp_distinct_orgs';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'module_archives_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'module_archives_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
        ];
      };
      module_audit_logs: {
        Row: {
          action: string;
          changed_fields: string[] | null;
          context_company_id: number | null;
          context_fund_id: number | null;
          created_at: string;
          id: string;
          ip_address: string | null;
          new_values: Json | null;
          old_values: Json | null;
          organization_id: string | null;
          record_id: string;
          source: string | null;
          table_name: string;
          user_id: string | null;
        };
        Insert: {
          action: string;
          changed_fields?: string[] | null;
          context_company_id?: number | null;
          context_fund_id?: number | null;
          created_at?: string;
          id?: string;
          ip_address?: string | null;
          new_values?: Json | null;
          old_values?: Json | null;
          organization_id?: string | null;
          record_id: string;
          source?: string | null;
          table_name: string;
          user_id?: string | null;
        };
        Update: {
          action?: string;
          changed_fields?: string[] | null;
          context_company_id?: number | null;
          context_fund_id?: number | null;
          created_at?: string;
          id?: string;
          ip_address?: string | null;
          new_values?: Json | null;
          old_values?: Json | null;
          organization_id?: string | null;
          record_id?: string;
          source?: string | null;
          table_name?: string;
          user_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'module_audit_logs_context_company_id_fkey';
            columns: ['context_company_id'];
            isOneToOne: false;
            referencedRelation: 'inv_company';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'module_audit_logs_context_company_id_fkey';
            columns: ['context_company_id'];
            isOneToOne: false;
            referencedRelation: 'v_inv_company_valuation';
            referencedColumns: ['company_id'];
          },
          {
            foreignKeyName: 'module_audit_logs_context_company_id_fkey';
            columns: ['context_company_id'];
            isOneToOne: false;
            referencedRelation: 'v_inv_info_rights_schedule';
            referencedColumns: ['company_id'];
          },
          {
            foreignKeyName: 'module_audit_logs_context_fund_id_fkey';
            columns: ['context_fund_id'];
            isOneToOne: false;
            referencedRelation: 'inv_fund';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'module_audit_logs_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'mcp_distinct_orgs';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'module_audit_logs_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'module_audit_logs_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
        ];
      };
      module_document_extractions: {
        Row: {
          created_at: string;
          file_id: number;
          id: string;
          module_document_id: number;
          raw_extraction: Json;
        };
        Insert: {
          created_at?: string;
          file_id: number;
          id?: string;
          module_document_id: number;
          raw_extraction: Json;
        };
        Update: {
          created_at?: string;
          file_id?: number;
          id?: string;
          module_document_id?: number;
          raw_extraction?: Json;
        };
        Relationships: [
          {
            foreignKeyName: 'module_document_extractions_file_id_fkey';
            columns: ['file_id'];
            isOneToOne: false;
            referencedRelation: 'module_document_files';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'module_document_extractions_module_document_id_fkey';
            columns: ['module_document_id'];
            isOneToOne: false;
            referencedRelation: 'module_documents';
            referencedColumns: ['id'];
          },
        ];
      };
      module_document_files: {
        Row: {
          created_at: string;
          file_hash: string | null;
          file_name: string;
          file_path: string;
          file_size: number | null;
          file_type: string | null;
          id: number;
          is_deleted: boolean | null;
          module_document_id: number;
          public_id: string | null;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          file_hash?: string | null;
          file_name: string;
          file_path: string;
          file_size?: number | null;
          file_type?: string | null;
          id?: number;
          is_deleted?: boolean | null;
          module_document_id: number;
          public_id?: string | null;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          file_hash?: string | null;
          file_name?: string;
          file_path?: string;
          file_size?: number | null;
          file_type?: string | null;
          id?: number;
          is_deleted?: boolean | null;
          module_document_id?: number;
          public_id?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'module_document_files_module_document_id_fkey';
            columns: ['module_document_id'];
            isOneToOne: false;
            referencedRelation: 'module_documents';
            referencedColumns: ['id'];
          },
        ];
      };
      module_document_funds: {
        Row: {
          created_at: string;
          fund_id: number;
          id: number;
          module_document_id: number;
          organization_id: string;
        };
        Insert: {
          created_at?: string;
          fund_id: number;
          id?: number;
          module_document_id: number;
          organization_id: string;
        };
        Update: {
          created_at?: string;
          fund_id?: number;
          id?: number;
          module_document_id?: number;
          organization_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'module_document_funds_fund_id_fkey';
            columns: ['fund_id'];
            isOneToOne: false;
            referencedRelation: 'inv_fund';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'module_document_funds_module_document_id_fkey';
            columns: ['module_document_id'];
            isOneToOne: false;
            referencedRelation: 'module_documents';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'module_document_funds_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'mcp_distinct_orgs';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'module_document_funds_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
        ];
      };
      module_document_signature_pages: {
        Row: {
          created_at: string;
          document_type_code: string | null;
          has_ties: boolean;
          id: number;
          investor_name: string | null;
          match_score: number | null;
          matched_module_document_id: number | null;
          organization_id: string;
          packet_module_document_id: number;
          page_number: number;
          page_signed: boolean;
          portfolio_company_name: string | null;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          document_type_code?: string | null;
          has_ties?: boolean;
          id?: number;
          investor_name?: string | null;
          match_score?: number | null;
          matched_module_document_id?: number | null;
          organization_id: string;
          packet_module_document_id: number;
          page_number: number;
          page_signed?: boolean;
          portfolio_company_name?: string | null;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          document_type_code?: string | null;
          has_ties?: boolean;
          id?: number;
          investor_name?: string | null;
          match_score?: number | null;
          matched_module_document_id?: number | null;
          organization_id?: string;
          packet_module_document_id?: number;
          page_number?: number;
          page_signed?: boolean;
          portfolio_company_name?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'module_document_signature_pages_matched_module_document_id_fkey';
            columns: ['matched_module_document_id'];
            isOneToOne: false;
            referencedRelation: 'module_documents';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'module_document_signature_pages_packet_module_document_id_fkey';
            columns: ['packet_module_document_id'];
            isOneToOne: false;
            referencedRelation: 'module_documents';
            referencedColumns: ['id'];
          },
        ];
      };
      module_document_status_types: {
        Row: {
          code: string | null;
          created_at: string;
          description: string | null;
          id: number;
          name: string | null;
        };
        Insert: {
          code?: string | null;
          created_at?: string;
          description?: string | null;
          id?: number;
          name?: string | null;
        };
        Update: {
          code?: string | null;
          created_at?: string;
          description?: string | null;
          id?: number;
          name?: string | null;
        };
        Relationships: [];
      };
      module_documents: {
        Row: {
          ai_extraction_status:
            | Database['public']['Enums']['ai_extraction_status']
            | null;
          company_id: number | null;
          created_at: string;
          document_type_id: number | null;
          entity_id: number | null;
          id: number;
          is_deleted: boolean | null;
          locked_by: string | null;
          locked_by_email: string | null;
          metadata: Json | null;
          module_id: number;
          organization_id: string;
          public_id: string | null;
          status_id: number | null;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          ai_extraction_status?:
            | Database['public']['Enums']['ai_extraction_status']
            | null;
          company_id?: number | null;
          created_at?: string;
          document_type_id?: number | null;
          entity_id?: number | null;
          id?: number;
          is_deleted?: boolean | null;
          locked_by?: string | null;
          locked_by_email?: string | null;
          metadata?: Json | null;
          module_id: number;
          organization_id: string;
          public_id?: string | null;
          status_id?: number | null;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          ai_extraction_status?:
            | Database['public']['Enums']['ai_extraction_status']
            | null;
          company_id?: number | null;
          created_at?: string;
          document_type_id?: number | null;
          entity_id?: number | null;
          id?: number;
          is_deleted?: boolean | null;
          locked_by?: string | null;
          locked_by_email?: string | null;
          metadata?: Json | null;
          module_id?: number;
          organization_id?: string;
          public_id?: string | null;
          status_id?: number | null;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'module_documents_company_id_fkey';
            columns: ['company_id'];
            isOneToOne: false;
            referencedRelation: 'inv_company';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'module_documents_company_id_fkey';
            columns: ['company_id'];
            isOneToOne: false;
            referencedRelation: 'v_inv_company_valuation';
            referencedColumns: ['company_id'];
          },
          {
            foreignKeyName: 'module_documents_company_id_fkey';
            columns: ['company_id'];
            isOneToOne: false;
            referencedRelation: 'v_inv_info_rights_schedule';
            referencedColumns: ['company_id'];
          },
          {
            foreignKeyName: 'module_documents_document_type_id_fkey';
            columns: ['document_type_id'];
            isOneToOne: false;
            referencedRelation: 'document_types';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'module_documents_entity_id_fkey';
            columns: ['entity_id'];
            isOneToOne: false;
            referencedRelation: 'module_entities';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'module_documents_module_id_fkey';
            columns: ['module_id'];
            isOneToOne: false;
            referencedRelation: 'app_modules';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'module_documents_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'mcp_distinct_orgs';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'module_documents_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'module_documents_status_id_fkey';
            columns: ['status_id'];
            isOneToOne: false;
            referencedRelation: 'module_document_status_types';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'module_documents_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
        ];
      };
      module_entities: {
        Row: {
          company_id: number | null;
          created_at: string | null;
          entity_type: string;
          id: number;
          metadata: Json | null;
          module_id: number;
          name: string | null;
          organization_id: string;
          public_id: string | null;
          status: string | null;
          updated_at: string | null;
        };
        Insert: {
          company_id?: number | null;
          created_at?: string | null;
          entity_type: string;
          id?: number;
          metadata?: Json | null;
          module_id: number;
          name?: string | null;
          organization_id: string;
          public_id?: string | null;
          status?: string | null;
          updated_at?: string | null;
        };
        Update: {
          company_id?: number | null;
          created_at?: string | null;
          entity_type?: string;
          id?: number;
          metadata?: Json | null;
          module_id?: number;
          name?: string | null;
          organization_id?: string;
          public_id?: string | null;
          status?: string | null;
          updated_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'module_entities_company_id_fkey';
            columns: ['company_id'];
            isOneToOne: false;
            referencedRelation: 'companies';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'module_entities_module_id_fkey';
            columns: ['module_id'];
            isOneToOne: false;
            referencedRelation: 'app_modules';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'module_entities_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'mcp_distinct_orgs';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'module_entities_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
        ];
      };
      module_entity_tags: {
        Row: {
          created_at: string | null;
          entity_id: number;
          id: number;
          tag_id: number;
        };
        Insert: {
          created_at?: string | null;
          entity_id: number;
          id?: number;
          tag_id: number;
        };
        Update: {
          created_at?: string | null;
          entity_id?: number;
          id?: number;
          tag_id?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'module_entity_tags_entity_id_fkey';
            columns: ['entity_id'];
            isOneToOne: false;
            referencedRelation: 'module_entities';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'module_entity_tags_tag_id_fkey';
            columns: ['tag_id'];
            isOneToOne: false;
            referencedRelation: 'user_tags';
            referencedColumns: ['id'];
          },
        ];
      };
      org_employees: {
        Row: {
          business_unit: string | null;
          cost_center: string | null;
          country: string | null;
          created_at: string;
          deleted_at: string | null;
          department: string | null;
          division: string | null;
          email: string | null;
          employee_id: string | null;
          entity: string | null;
          first_name: string;
          group_id: number | null;
          id: number;
          last_name: string;
          leave_date: string | null;
          org_unit_id: number | null;
          organization_id: string;
          region: string | null;
          start_date: string | null;
          status: string;
          team: string | null;
          updated_at: string | null;
        };
        Insert: {
          business_unit?: string | null;
          cost_center?: string | null;
          country?: string | null;
          created_at?: string;
          deleted_at?: string | null;
          department?: string | null;
          division?: string | null;
          email?: string | null;
          employee_id?: string | null;
          entity?: string | null;
          first_name: string;
          group_id?: number | null;
          id?: number;
          last_name: string;
          leave_date?: string | null;
          org_unit_id?: number | null;
          organization_id: string;
          region?: string | null;
          start_date?: string | null;
          status?: string;
          team?: string | null;
          updated_at?: string | null;
        };
        Update: {
          business_unit?: string | null;
          cost_center?: string | null;
          country?: string | null;
          created_at?: string;
          deleted_at?: string | null;
          department?: string | null;
          division?: string | null;
          email?: string | null;
          employee_id?: string | null;
          entity?: string | null;
          first_name?: string;
          group_id?: number | null;
          id?: number;
          last_name?: string;
          leave_date?: string | null;
          org_unit_id?: number | null;
          organization_id?: string;
          region?: string | null;
          start_date?: string | null;
          status?: string;
          team?: string | null;
          updated_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'org_employees_group_id_fkey';
            columns: ['group_id'];
            isOneToOne: false;
            referencedRelation: 'groups';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'org_employees_org_unit_fkey';
            columns: ['organization_id', 'org_unit_id'];
            isOneToOne: false;
            referencedRelation: 'org_units';
            referencedColumns: ['organization_id', 'id'];
          },
          {
            foreignKeyName: 'org_employees_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'mcp_distinct_orgs';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'org_employees_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
        ];
      };
      org_preferences: {
        Row: {
          created_at: string;
          id: string;
          organization_id: string;
          preference_key: string;
          preference_value: Json;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          organization_id: string;
          preference_key: string;
          preference_value: Json;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          organization_id?: string;
          preference_key?: string;
          preference_value?: Json;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'org_preferences_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'mcp_distinct_orgs';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'org_preferences_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
        ];
      };
      org_units: {
        Row: {
          created_at: string;
          id: number;
          level: string;
          name: string;
          organization_id: string;
          parent_id: number | null;
          updated_at: string | null;
        };
        Insert: {
          created_at?: string;
          id?: number;
          level: string;
          name: string;
          organization_id: string;
          parent_id?: number | null;
          updated_at?: string | null;
        };
        Update: {
          created_at?: string;
          id?: number;
          level?: string;
          name?: string;
          organization_id?: string;
          parent_id?: number | null;
          updated_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'org_units_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'mcp_distinct_orgs';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'org_units_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'org_units_parent_fkey';
            columns: ['organization_id', 'parent_id'];
            isOneToOne: false;
            referencedRelation: 'org_units';
            referencedColumns: ['organization_id', 'id'];
          },
        ];
      };
      organization_modules: {
        Row: {
          enabled_at: string | null;
          enabled_by: string | null;
          id: string;
          is_enabled: boolean | null;
          module_id: number;
          organization_id: string;
          settings: Json | null;
        };
        Insert: {
          enabled_at?: string | null;
          enabled_by?: string | null;
          id?: string;
          is_enabled?: boolean | null;
          module_id: number;
          organization_id: string;
          settings?: Json | null;
        };
        Update: {
          enabled_at?: string | null;
          enabled_by?: string | null;
          id?: string;
          is_enabled?: boolean | null;
          module_id?: number;
          organization_id?: string;
          settings?: Json | null;
        };
        Relationships: [
          {
            foreignKeyName: 'organization_modules_enabled_by_fkey';
            columns: ['enabled_by'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'organization_modules_module_id_fkey';
            columns: ['module_id'];
            isOneToOne: false;
            referencedRelation: 'app_modules';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'organization_modules_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'mcp_distinct_orgs';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'organization_modules_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
        ];
      };
      organization_vendor_settings: {
        Row: {
          created_at: string | null;
          notes: string | null;
          organization_id: string;
          primary_contact_email: string | null;
          primary_contact_name: string | null;
          primary_contact_phone: string | null;
          settings: Json;
          updated_at: string | null;
          vendor_id: number;
        };
        Insert: {
          created_at?: string | null;
          notes?: string | null;
          organization_id: string;
          primary_contact_email?: string | null;
          primary_contact_name?: string | null;
          primary_contact_phone?: string | null;
          settings?: Json;
          updated_at?: string | null;
          vendor_id: number;
        };
        Update: {
          created_at?: string | null;
          notes?: string | null;
          organization_id?: string;
          primary_contact_email?: string | null;
          primary_contact_name?: string | null;
          primary_contact_phone?: string | null;
          settings?: Json;
          updated_at?: string | null;
          vendor_id?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'organization_vendor_settings_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'mcp_distinct_orgs';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'organization_vendor_settings_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'organization_vendor_settings_vendor_id_fkey';
            columns: ['vendor_id'];
            isOneToOne: false;
            referencedRelation: 'vendors';
            referencedColumns: ['id'];
          },
        ];
      };
      organizations: {
        Row: {
          app_access: boolean | null;
          created_at: string;
          domain: string | null;
          fiscal_year_start_month: number;
          id: string;
          is_demo_org: boolean | null;
          logo_path: string | null;
          missing_clauses_confirmed: boolean;
          missing_clauses_settings: Json | null;
          name: string;
          postsig_email_address: string | null;
          status: Database['public']['Enums']['organization_status'];
          trial: boolean | null;
          upload_app_access: boolean | null;
        };
        Insert: {
          app_access?: boolean | null;
          created_at?: string;
          domain?: string | null;
          fiscal_year_start_month?: number;
          id?: string;
          is_demo_org?: boolean | null;
          logo_path?: string | null;
          missing_clauses_confirmed?: boolean;
          missing_clauses_settings?: Json | null;
          name: string;
          postsig_email_address?: string | null;
          status?: Database['public']['Enums']['organization_status'];
          trial?: boolean | null;
          upload_app_access?: boolean | null;
        };
        Update: {
          app_access?: boolean | null;
          created_at?: string;
          domain?: string | null;
          fiscal_year_start_month?: number;
          id?: string;
          is_demo_org?: boolean | null;
          logo_path?: string | null;
          missing_clauses_confirmed?: boolean;
          missing_clauses_settings?: Json | null;
          name?: string;
          postsig_email_address?: string | null;
          status?: Database['public']['Enums']['organization_status'];
          trial?: boolean | null;
          upload_app_access?: boolean | null;
        };
        Relationships: [];
      };
      portfolio_company_funds: {
        Row: {
          created_at: string;
          fund_id: number;
          portfolio_company_id: number;
        };
        Insert: {
          created_at?: string;
          fund_id: number;
          portfolio_company_id: number;
        };
        Update: {
          created_at?: string;
          fund_id?: number;
          portfolio_company_id?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'portfolio_company_funds_fund_id_fkey';
            columns: ['fund_id'];
            isOneToOne: false;
            referencedRelation: 'investor_funds';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'portfolio_company_funds_portfolio_company_id_fkey';
            columns: ['portfolio_company_id'];
            isOneToOne: false;
            referencedRelation: 'module_entities';
            referencedColumns: ['id'];
          },
        ];
      };
      prompt_candidates: {
        Row: {
          candidate_data: Json;
          created_at: string;
          id: string;
          source: string | null;
          status: Database['public']['Enums']['prompt_candidate_status'];
        };
        Insert: {
          candidate_data: Json;
          created_at?: string;
          id?: string;
          source?: string | null;
          status?: Database['public']['Enums']['prompt_candidate_status'];
        };
        Update: {
          candidate_data?: Json;
          created_at?: string;
          id?: string;
          source?: string | null;
          status?: Database['public']['Enums']['prompt_candidate_status'];
        };
        Relationships: [];
      };
      prompt_evaluations: {
        Row: {
          created_at: string;
          evaluation_metrics: Json;
          evaluation_passed: boolean | null;
          id: string;
          notes: string | null;
          prompt_version_id: string;
          sample_document_id: string;
        };
        Insert: {
          created_at?: string;
          evaluation_metrics: Json;
          evaluation_passed?: boolean | null;
          id?: string;
          notes?: string | null;
          prompt_version_id: string;
          sample_document_id: string;
        };
        Update: {
          created_at?: string;
          evaluation_metrics?: Json;
          evaluation_passed?: boolean | null;
          id?: string;
          notes?: string | null;
          prompt_version_id?: string;
          sample_document_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'prompt_evaluations_prompt_version_id_fkey';
            columns: ['prompt_version_id'];
            isOneToOne: false;
            referencedRelation: 'prompt_versions';
            referencedColumns: ['id'];
          },
        ];
      };
      prompt_template_groups: {
        Row: {
          active_version_id: string | null;
          created_at: string;
          description: string | null;
          group_key: string;
          id: string;
          module_id: number | null;
          updated_at: string;
        };
        Insert: {
          active_version_id?: string | null;
          created_at?: string;
          description?: string | null;
          group_key: string;
          id?: string;
          module_id?: number | null;
          updated_at?: string;
        };
        Update: {
          active_version_id?: string | null;
          created_at?: string;
          description?: string | null;
          group_key?: string;
          id?: string;
          module_id?: number | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'fk_active_version';
            columns: ['active_version_id'];
            isOneToOne: false;
            referencedRelation: 'prompt_templates';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'prompt_template_groups_module_id_fkey';
            columns: ['module_id'];
            isOneToOne: false;
            referencedRelation: 'app_modules';
            referencedColumns: ['id'];
          },
        ];
      };
      prompt_templates: {
        Row: {
          created_at: string;
          id: string;
          is_active: boolean;
          llm_parameters: Json | null;
          prompt_group_id: string;
          prompt_key: string | null;
          template_content: string;
          updated_at: string;
          version: number;
          version_display: string | null;
          version_timestamp: string | null;
        };
        Insert: {
          created_at?: string;
          id?: string;
          is_active?: boolean;
          llm_parameters?: Json | null;
          prompt_group_id: string;
          prompt_key?: string | null;
          template_content: string;
          updated_at?: string;
          version?: number;
          version_display?: string | null;
          version_timestamp?: string | null;
        };
        Update: {
          created_at?: string;
          id?: string;
          is_active?: boolean;
          llm_parameters?: Json | null;
          prompt_group_id?: string;
          prompt_key?: string | null;
          template_content?: string;
          updated_at?: string;
          version?: number;
          version_display?: string | null;
          version_timestamp?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'prompt_templates_prompt_group_id_fkey';
            columns: ['prompt_group_id'];
            isOneToOne: false;
            referencedRelation: 'prompt_template_groups';
            referencedColumns: ['id'];
          },
        ];
      };
      prompt_versions: {
        Row: {
          created_at: string;
          id: string;
          is_draft: boolean;
          is_finalized_for_evaluation: boolean;
          llm_feedback: Json | null;
          parent_version_id: string | null;
          prompt_candidate_id: string;
          prompt_text: string;
          refinement_details: Json | null;
          version_number: number;
        };
        Insert: {
          created_at?: string;
          id?: string;
          is_draft?: boolean;
          is_finalized_for_evaluation?: boolean;
          llm_feedback?: Json | null;
          parent_version_id?: string | null;
          prompt_candidate_id: string;
          prompt_text: string;
          refinement_details?: Json | null;
          version_number: number;
        };
        Update: {
          created_at?: string;
          id?: string;
          is_draft?: boolean;
          is_finalized_for_evaluation?: boolean;
          llm_feedback?: Json | null;
          parent_version_id?: string | null;
          prompt_candidate_id?: string;
          prompt_text?: string;
          refinement_details?: Json | null;
          version_number?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'prompt_versions_parent_version_id_fkey';
            columns: ['parent_version_id'];
            isOneToOne: false;
            referencedRelation: 'prompt_versions';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'prompt_versions_prompt_candidate_id_fkey';
            columns: ['prompt_candidate_id'];
            isOneToOne: false;
            referencedRelation: 'prompt_candidates';
            referencedColumns: ['id'];
          },
        ];
      };
      role_permissions: {
        Row: {
          id: number;
          permission: Database['public']['Enums']['app_permission'] | null;
          role: Database['public']['Enums']['app_role'];
        };
        Insert: {
          id?: number;
          permission?: Database['public']['Enums']['app_permission'] | null;
          role: Database['public']['Enums']['app_role'];
        };
        Update: {
          id?: number;
          permission?: Database['public']['Enums']['app_permission'] | null;
          role?: Database['public']['Enums']['app_role'];
        };
        Relationships: [];
      };
      roles: {
        Row: {
          description: string | null;
          id: number;
          name: string;
        };
        Insert: {
          description?: string | null;
          id: number;
          name: string;
        };
        Update: {
          description?: string | null;
          id?: number;
          name?: string;
        };
        Relationships: [];
      };
      sub_asset_classes: {
        Row: {
          id: number;
          name: string;
          parent_id: number;
        };
        Insert: {
          id?: number;
          name: string;
          parent_id: number;
        };
        Update: {
          id?: number;
          name?: string;
          parent_id?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'sub_asset_classes_parent_id_fkey';
            columns: ['parent_id'];
            isOneToOne: false;
            referencedRelation: 'asset_classes';
            referencedColumns: ['id'];
          },
        ];
      };
      trusted_devices: {
        Row: {
          created_at: string;
          device_info: Json | null;
          device_name: string | null;
          device_token: string;
          expires_at: string;
          id: string;
          ip_address: unknown;
          last_used_at: string;
          trusted_at: string;
          updated_at: string;
          user_agent: string | null;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          device_info?: Json | null;
          device_name?: string | null;
          device_token: string;
          expires_at: string;
          id?: string;
          ip_address?: unknown;
          last_used_at?: string;
          trusted_at?: string;
          updated_at?: string;
          user_agent?: string | null;
          user_id: string;
        };
        Update: {
          created_at?: string;
          device_info?: Json | null;
          device_name?: string | null;
          device_token?: string;
          expires_at?: string;
          id?: string;
          ip_address?: unknown;
          last_used_at?: string;
          trusted_at?: string;
          updated_at?: string;
          user_agent?: string | null;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'trusted_devices_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
        ];
      };
      user_module_access: {
        Row: {
          granted_at: string | null;
          granted_by: string | null;
          id: string;
          is_active: boolean | null;
          is_default: boolean | null;
          module_id: number;
          organization_id: string;
          revoked_at: string | null;
          revoked_by: string | null;
          user_id: string;
        };
        Insert: {
          granted_at?: string | null;
          granted_by?: string | null;
          id?: string;
          is_active?: boolean | null;
          is_default?: boolean | null;
          module_id: number;
          organization_id: string;
          revoked_at?: string | null;
          revoked_by?: string | null;
          user_id: string;
        };
        Update: {
          granted_at?: string | null;
          granted_by?: string | null;
          id?: string;
          is_active?: boolean | null;
          is_default?: boolean | null;
          module_id?: number;
          organization_id?: string;
          revoked_at?: string | null;
          revoked_by?: string | null;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'user_module_access_granted_by_fkey';
            columns: ['granted_by'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'user_module_access_module_id_fkey';
            columns: ['module_id'];
            isOneToOne: false;
            referencedRelation: 'app_modules';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'user_module_access_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'mcp_distinct_orgs';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'user_module_access_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'user_module_access_revoked_by_fkey';
            columns: ['revoked_by'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'user_module_access_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
        ];
      };
      user_preferences: {
        Row: {
          created_at: string;
          id: string;
          preference_key: string;
          preference_value: Json;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          preference_key: string;
          preference_value: Json;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          preference_key?: string;
          preference_value?: Json;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'user_preferences_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
        ];
      };
      user_roles: {
        Row: {
          id: number;
          role: Database['public']['Enums']['app_role'];
          user_id: string;
        };
        Insert: {
          id?: number;
          role: Database['public']['Enums']['app_role'];
          user_id: string;
        };
        Update: {
          id?: number;
          role?: Database['public']['Enums']['app_role'];
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'user_roles_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
        ];
      };
      user_roles2: {
        Row: {
          id: number;
          role_id: number;
          user_id: string;
        };
        Insert: {
          id?: number;
          role_id: number;
          user_id: string;
        };
        Update: {
          id?: number;
          role_id?: number;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'user_roles2_role_id_fkey';
            columns: ['role_id'];
            isOneToOne: false;
            referencedRelation: 'roles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'user_roles2_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
        ];
      };
      user_tags: {
        Row: {
          created_at: string | null;
          id: number;
          name: string;
          org_id: string;
          updated_at: string | null;
        };
        Insert: {
          created_at?: string | null;
          id?: number;
          name: string;
          org_id: string;
          updated_at?: string | null;
        };
        Update: {
          created_at?: string | null;
          id?: number;
          name?: string;
          org_id?: string;
          updated_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'user_tags_org_id_fkey';
            columns: ['org_id'];
            isOneToOne: false;
            referencedRelation: 'mcp_distinct_orgs';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'user_tags_org_id_fkey';
            columns: ['org_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
        ];
      };
      users: {
        Row: {
          accepted_terms: boolean | null;
          advance_notice_period: number | null;
          backup_codes_generated: boolean | null;
          backup_codes_used: Json | null;
          department: string | null;
          docusign_access_token: string | null;
          docusign_account_id: string | null;
          docusign_base_uri: string | null;
          docusign_connected: boolean | null;
          docusign_refresh_token: string | null;
          email: string | null;
          email_alerts: boolean | null;
          email_frequency: string | null;
          email_mfa_attempts: number | null;
          email_mfa_enabled: boolean | null;
          email_mfa_last_sent: string | null;
          email_mfa_secret: string | null;
          email_mfa_session_id: string | null;
          email_mfa_session_verified_at: string | null;
          ftux_status: Json | null;
          id: string;
          job_title: string | null;
          last_notified_date: string | null;
          login_code_attempts: number | null;
          login_code_last_sent: string | null;
          mfa_enabled: boolean | null;
          mfa_last_verified_at: string | null;
          mfa_type: string | null;
          name: string | null;
          organization: string | null;
          organization_id: string | null;
          show_ftux: boolean;
          signed_up: boolean | null;
          updated_at: string | null;
        };
        Insert: {
          accepted_terms?: boolean | null;
          advance_notice_period?: number | null;
          backup_codes_generated?: boolean | null;
          backup_codes_used?: Json | null;
          department?: string | null;
          docusign_access_token?: string | null;
          docusign_account_id?: string | null;
          docusign_base_uri?: string | null;
          docusign_connected?: boolean | null;
          docusign_refresh_token?: string | null;
          email?: string | null;
          email_alerts?: boolean | null;
          email_frequency?: string | null;
          email_mfa_attempts?: number | null;
          email_mfa_enabled?: boolean | null;
          email_mfa_last_sent?: string | null;
          email_mfa_secret?: string | null;
          email_mfa_session_id?: string | null;
          email_mfa_session_verified_at?: string | null;
          ftux_status?: Json | null;
          id: string;
          job_title?: string | null;
          last_notified_date?: string | null;
          login_code_attempts?: number | null;
          login_code_last_sent?: string | null;
          mfa_enabled?: boolean | null;
          mfa_last_verified_at?: string | null;
          mfa_type?: string | null;
          name?: string | null;
          organization?: string | null;
          organization_id?: string | null;
          show_ftux?: boolean;
          signed_up?: boolean | null;
          updated_at?: string | null;
        };
        Update: {
          accepted_terms?: boolean | null;
          advance_notice_period?: number | null;
          backup_codes_generated?: boolean | null;
          backup_codes_used?: Json | null;
          department?: string | null;
          docusign_access_token?: string | null;
          docusign_account_id?: string | null;
          docusign_base_uri?: string | null;
          docusign_connected?: boolean | null;
          docusign_refresh_token?: string | null;
          email?: string | null;
          email_alerts?: boolean | null;
          email_frequency?: string | null;
          email_mfa_attempts?: number | null;
          email_mfa_enabled?: boolean | null;
          email_mfa_last_sent?: string | null;
          email_mfa_secret?: string | null;
          email_mfa_session_id?: string | null;
          email_mfa_session_verified_at?: string | null;
          ftux_status?: Json | null;
          id?: string;
          job_title?: string | null;
          last_notified_date?: string | null;
          login_code_attempts?: number | null;
          login_code_last_sent?: string | null;
          mfa_enabled?: boolean | null;
          mfa_last_verified_at?: string | null;
          mfa_type?: string | null;
          name?: string | null;
          organization?: string | null;
          organization_id?: string | null;
          show_ftux?: boolean;
          signed_up?: boolean | null;
          updated_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'users_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'mcp_distinct_orgs';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'users_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
        ];
      };
      vendor_product_lineage_events: {
        Row: {
          action: string;
          confirmed_at: string | null;
          confirmed_by: string | null;
          contract_id: number;
          created_at: string;
          created_by: string | null;
          evidence: Json | null;
          id: number;
          organization_id: string;
          product_id: number | null;
          source: string;
          status: string;
        };
        Insert: {
          action: string;
          confirmed_at?: string | null;
          confirmed_by?: string | null;
          contract_id: number;
          created_at?: string;
          created_by?: string | null;
          evidence?: Json | null;
          id?: never;
          organization_id: string;
          product_id?: number | null;
          source: string;
          status?: string;
        };
        Update: {
          action?: string;
          confirmed_at?: string | null;
          confirmed_by?: string | null;
          contract_id?: number;
          created_at?: string;
          created_by?: string | null;
          evidence?: Json | null;
          id?: never;
          organization_id?: string;
          product_id?: number | null;
          source?: string;
          status?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'vendor_product_lineage_events_confirmed_by_fkey';
            columns: ['confirmed_by'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'vendor_product_lineage_events_contract_id_fkey';
            columns: ['contract_id'];
            isOneToOne: false;
            referencedRelation: 'contracts';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'vendor_product_lineage_events_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'vendor_product_lineage_events_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'mcp_distinct_orgs';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'vendor_product_lineage_events_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'vendor_product_lineage_events_product_id_fkey';
            columns: ['product_id'];
            isOneToOne: false;
            referencedRelation: 'vendor_products';
            referencedColumns: ['id'];
          },
        ];
      };
      vendor_products: {
        Row: {
          created_at: string;
          delivery_method_id: number | null;
          id: number;
          name: string;
          product_code: string | null;
          updated_at: string | null;
          vendor_id: number;
        };
        Insert: {
          created_at?: string;
          delivery_method_id?: number | null;
          id?: number;
          name: string;
          product_code?: string | null;
          updated_at?: string | null;
          vendor_id: number;
        };
        Update: {
          created_at?: string;
          delivery_method_id?: number | null;
          id?: number;
          name?: string;
          product_code?: string | null;
          updated_at?: string | null;
          vendor_id?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'vendor_products_delivery_method_id_fkey';
            columns: ['delivery_method_id'];
            isOneToOne: false;
            referencedRelation: 'data_delivery_types';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'vendor_products_vendor_id_fkey';
            columns: ['vendor_id'];
            isOneToOne: false;
            referencedRelation: 'vendors';
            referencedColumns: ['id'];
          },
        ];
      };
      vendor_products_details: {
        Row: {
          account_number: string | null;
          change_activity: string | null;
          contract_id: number;
          created_at: string;
          fees: number | null;
          id: number;
          n_users: number | null;
          one_time_only: boolean;
          period_end: string | null;
          period_start: string | null;
          product_id: number;
          quantity: number | null;
          rate: number | null;
          sort_order: number | null;
          user_id: string | null;
          year: number;
        };
        Insert: {
          account_number?: string | null;
          change_activity?: string | null;
          contract_id: number;
          created_at?: string;
          fees?: number | null;
          id?: number;
          n_users?: number | null;
          one_time_only?: boolean;
          period_end?: string | null;
          period_start?: string | null;
          product_id: number;
          quantity?: number | null;
          rate?: number | null;
          sort_order?: number | null;
          user_id?: string | null;
          year: number;
        };
        Update: {
          account_number?: string | null;
          change_activity?: string | null;
          contract_id?: number;
          created_at?: string;
          fees?: number | null;
          id?: number;
          n_users?: number | null;
          one_time_only?: boolean;
          period_end?: string | null;
          period_start?: string | null;
          product_id?: number;
          quantity?: number | null;
          rate?: number | null;
          sort_order?: number | null;
          user_id?: string | null;
          year?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'vendor_products_details_contract_id_fkey';
            columns: ['contract_id'];
            isOneToOne: false;
            referencedRelation: 'contracts';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'vendor_products_details_product_id_fkey';
            columns: ['product_id'];
            isOneToOne: false;
            referencedRelation: 'vendor_products';
            referencedColumns: ['id'];
          },
        ];
      };
      vendor_products_details_versions: {
        Row: {
          actor: string | null;
          changed_data: Json | null;
          comment: string | null;
          contract_id: number;
          contract_version_id: number;
          created_at: string;
          created_by: string | null;
          fees: number | null;
          id: number;
          n_users: number | null;
          organization_id: string | null;
          product_id: number | null;
          user_id: string | null;
          valid_from: string;
          valid_to: string | null;
          vendor_products_details_id: number;
          version_id: number;
          year: number | null;
        };
        Insert: {
          actor?: string | null;
          changed_data?: Json | null;
          comment?: string | null;
          contract_id: number;
          contract_version_id: number;
          created_at?: string;
          created_by?: string | null;
          fees?: number | null;
          id?: number;
          n_users?: number | null;
          organization_id?: string | null;
          product_id?: number | null;
          user_id?: string | null;
          valid_from?: string;
          valid_to?: string | null;
          vendor_products_details_id: number;
          version_id: number;
          year?: number | null;
        };
        Update: {
          actor?: string | null;
          changed_data?: Json | null;
          comment?: string | null;
          contract_id?: number;
          contract_version_id?: number;
          created_at?: string;
          created_by?: string | null;
          fees?: number | null;
          id?: number;
          n_users?: number | null;
          organization_id?: string | null;
          product_id?: number | null;
          user_id?: string | null;
          valid_from?: string;
          valid_to?: string | null;
          vendor_products_details_id?: number;
          version_id?: number;
          year?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: 'vendor_products_details_version_vendor_products_details_id_fkey';
            columns: ['vendor_products_details_id'];
            isOneToOne: false;
            referencedRelation: 'vendor_products_details';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'vendor_products_details_versions_contract_id_fkey';
            columns: ['contract_id'];
            isOneToOne: false;
            referencedRelation: 'contracts';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'vendor_products_details_versions_contract_version_id_fkey';
            columns: ['contract_version_id'];
            isOneToOne: false;
            referencedRelation: 'contract_versions';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'vendor_products_details_versions_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'vendor_products_details_versions_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'mcp_distinct_orgs';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'vendor_products_details_versions_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
        ];
      };
      vendor_products_eafs_fees: {
        Row: {
          created_at: string;
          id: number;
          period_months: number;
          product_fee: number;
          vpd_id: number;
        };
        Insert: {
          created_at?: string;
          id?: never;
          period_months: number;
          product_fee: number;
          vpd_id: number;
        };
        Update: {
          created_at?: string;
          id?: never;
          period_months?: number;
          product_fee?: number;
          vpd_id?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'vendor_products_eafs_fees_vpd_id_fkey';
            columns: ['vpd_id'];
            isOneToOne: false;
            referencedRelation: 'vendor_products_details';
            referencedColumns: ['id'];
          },
        ];
      };
      vendor_products_users: {
        Row: {
          contract_id: number | null;
          created_at: string;
          enterprise: boolean | null;
          id: number;
          number_of_users: number | null;
          product_id: number | null;
          updated_at: string | null;
        };
        Insert: {
          contract_id?: number | null;
          created_at?: string;
          enterprise?: boolean | null;
          id?: number;
          number_of_users?: number | null;
          product_id?: number | null;
          updated_at?: string | null;
        };
        Update: {
          contract_id?: number | null;
          created_at?: string;
          enterprise?: boolean | null;
          id?: number;
          number_of_users?: number | null;
          product_id?: number | null;
          updated_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'vendor_products_users_contract_id_fkey';
            columns: ['contract_id'];
            isOneToOne: false;
            referencedRelation: 'contracts';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'vendor_products_users_product_id_fkey';
            columns: ['product_id'];
            isOneToOne: false;
            referencedRelation: 'vendor_products';
            referencedColumns: ['id'];
          },
        ];
      };
      vendor_products_users_versions: {
        Row: {
          changed_data: Json | null;
          contract_id: number;
          contract_version_id: number;
          created_at: string;
          created_by: string | null;
          id: number;
          number_of_users: number | null;
          organization_id: string | null;
          product_id: number | null;
          valid_from: string;
          valid_to: string | null;
          vendor_products_users_id: number;
          version_id: number;
        };
        Insert: {
          changed_data?: Json | null;
          contract_id: number;
          contract_version_id: number;
          created_at?: string;
          created_by?: string | null;
          id?: number;
          number_of_users?: number | null;
          organization_id?: string | null;
          product_id?: number | null;
          valid_from?: string;
          valid_to?: string | null;
          vendor_products_users_id: number;
          version_id: number;
        };
        Update: {
          changed_data?: Json | null;
          contract_id?: number;
          contract_version_id?: number;
          created_at?: string;
          created_by?: string | null;
          id?: number;
          number_of_users?: number | null;
          organization_id?: string | null;
          product_id?: number | null;
          valid_from?: string;
          valid_to?: string | null;
          vendor_products_users_id?: number;
          version_id?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'vendor_products_users_versions_contract_id_fkey';
            columns: ['contract_id'];
            isOneToOne: false;
            referencedRelation: 'contracts';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'vendor_products_users_versions_contract_version_id_fkey';
            columns: ['contract_version_id'];
            isOneToOne: false;
            referencedRelation: 'contract_versions';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'vendor_products_users_versions_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'vendor_products_users_versions_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'mcp_distinct_orgs';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'vendor_products_users_versions_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'vendor_products_users_versions_vendor_products_users_id_fkey';
            columns: ['vendor_products_users_id'];
            isOneToOne: false;
            referencedRelation: 'vendor_products_users';
            referencedColumns: ['id'];
          },
        ];
      };
      vendor_products_versions: {
        Row: {
          actor: string | null;
          changed_data: Json | null;
          comment: string | null;
          contract_id: number;
          contract_version_id: number;
          created_at: string;
          created_by: string | null;
          delivery_method_id: number | null;
          id: number;
          name: string | null;
          organization_id: string | null;
          product_code: string | null;
          updated_at: string | null;
          valid_from: string;
          valid_to: string | null;
          vendor_id: number | null;
          vendor_product_id: number;
          version_id: number;
        };
        Insert: {
          actor?: string | null;
          changed_data?: Json | null;
          comment?: string | null;
          contract_id: number;
          contract_version_id: number;
          created_at?: string;
          created_by?: string | null;
          delivery_method_id?: number | null;
          id?: number;
          name?: string | null;
          organization_id?: string | null;
          product_code?: string | null;
          updated_at?: string | null;
          valid_from?: string;
          valid_to?: string | null;
          vendor_id?: number | null;
          vendor_product_id: number;
          version_id: number;
        };
        Update: {
          actor?: string | null;
          changed_data?: Json | null;
          comment?: string | null;
          contract_id?: number;
          contract_version_id?: number;
          created_at?: string;
          created_by?: string | null;
          delivery_method_id?: number | null;
          id?: number;
          name?: string | null;
          organization_id?: string | null;
          product_code?: string | null;
          updated_at?: string | null;
          valid_from?: string;
          valid_to?: string | null;
          vendor_id?: number | null;
          vendor_product_id?: number;
          version_id?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'vendor_products_versions_contract_id_fkey';
            columns: ['contract_id'];
            isOneToOne: false;
            referencedRelation: 'contracts';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'vendor_products_versions_contract_version_id_fkey';
            columns: ['contract_version_id'];
            isOneToOne: false;
            referencedRelation: 'contract_versions';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'vendor_products_versions_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'vendor_products_versions_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'mcp_distinct_orgs';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'vendor_products_versions_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'vendor_products_versions_vendor_product_id_fkey';
            columns: ['vendor_product_id'];
            isOneToOne: false;
            referencedRelation: 'vendor_products';
            referencedColumns: ['id'];
          },
        ];
      };
      vendors: {
        Row: {
          address: string | null;
          created_at: string | null;
          description: string | null;
          domain: string | null;
          email: string | null;
          id: number;
          is_demo_vendor: boolean | null;
          merged_into_vendor_id: number | null;
          merger_effective_date: string | null;
          name: string;
          phone: number | null;
          status: Database['public']['Enums']['VendorStatus'] | null;
          updated_at: string | null;
        };
        Insert: {
          address?: string | null;
          created_at?: string | null;
          description?: string | null;
          domain?: string | null;
          email?: string | null;
          id?: number;
          is_demo_vendor?: boolean | null;
          merged_into_vendor_id?: number | null;
          merger_effective_date?: string | null;
          name: string;
          phone?: number | null;
          status?: Database['public']['Enums']['VendorStatus'] | null;
          updated_at?: string | null;
        };
        Update: {
          address?: string | null;
          created_at?: string | null;
          description?: string | null;
          domain?: string | null;
          email?: string | null;
          id?: number;
          is_demo_vendor?: boolean | null;
          merged_into_vendor_id?: number | null;
          merger_effective_date?: string | null;
          name?: string;
          phone?: number | null;
          status?: Database['public']['Enums']['VendorStatus'] | null;
          updated_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'vendors_merged_into_vendor_id_fkey';
            columns: ['merged_into_vendor_id'];
            isOneToOne: false;
            referencedRelation: 'vendors';
            referencedColumns: ['id'];
          },
        ];
      };
    };
    Views: {
      admin_activity_logs_mv: {
        Row: {
          action: string | null;
          contract_status: string | null;
          counterparty: string | null;
          detail: string | null;
          doc_type: string | null;
          file_name: string | null;
          is_demo_org: boolean | null;
          is_internal_user: boolean | null;
          module: string | null;
          organization_id: string | null;
          organization_name: string | null;
          raw_metadata: Json | null;
          resource_id: string | null;
          resource_type: string | null;
          search_doc: unknown;
          source: string | null;
          source_id: string | null;
          ts: string | null;
          user_email: string | null;
          user_id: string | null;
          user_name: string | null;
        };
        Relationships: [];
      };
      admin_org_module_monthly_mv: {
        Row: {
          is_demo_org: boolean | null;
          module: string | null;
          month_start: string | null;
          new_entities: number | null;
          organization_id: string | null;
          organization_name: string | null;
          published: number | null;
          uploaded: number | null;
        };
        Relationships: [];
      };
      admin_org_module_uploads_mv: {
        Row: {
          duplicate: number | null;
          failed: number | null;
          is_demo_org: boolean | null;
          latest_ts: string | null;
          module: string | null;
          organization_id: string | null;
          organization_name: string | null;
          pending: number | null;
          published: number | null;
          uploaded: number | null;
          uploaded_today: number | null;
        };
        Relationships: [];
      };
      current_vendors: {
        Row: {
          current_vendor_id: number | null;
          current_vendor_name: string | null;
          original_vendor_id: number | null;
        };
        Relationships: [];
      };
      extraction_stats: {
        Row: {
          contract_id: number | null;
          difference_seconds: number | null;
          published_at: string | null;
          uploaded_at: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'activities_contract_id_fkey';
            columns: ['contract_id'];
            isOneToOne: false;
            referencedRelation: 'contracts';
            referencedColumns: ['id'];
          },
        ];
      };
      investor_party_summary: {
        Row: {
          active_board_seats: number | null;
          anti_dilution_type: string | null;
          closings_participated: number | null;
          email: string | null;
          entity_id: number | null;
          entity_name: string | null;
          first_investment_date: string | null;
          information_rights: string | null;
          last_investment_date: string | null;
          liquidation_preference_multiple: number | null;
          major_investor: string | null;
          organization_id: string | null;
          party_id: number | null;
          party_name: string | null;
          party_type: string | null;
          pro_rata_rights: string | null;
          qsbs_qualified: string | null;
          rounds: string[] | null;
          rounds_participated: number | null;
          seat_types: string[] | null;
          total_invested: number | null;
        };
        Relationships: [
          {
            foreignKeyName: 'investor_closing_participant_party_id_fkey';
            columns: ['party_id'];
            isOneToOne: false;
            referencedRelation: 'investor_party';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'investor_financing_event_entity_id_fkey';
            columns: ['entity_id'];
            isOneToOne: false;
            referencedRelation: 'module_entities';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'investor_party_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'mcp_distinct_orgs';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'investor_party_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
        ];
      };
      investor_portfolio_metrics: {
        Row: {
          aggregate_cost: number | null;
          currency: string | null;
          current_price_per_unit: number | null;
          entity_id: number | null;
          entity_name: string | null;
          first_acquired_date: string | null;
          fully_diluted_percent: number | null;
          fully_diluted_total: number | null;
          implied_value: number | null;
          last_acquired_date: string | null;
          last_transaction_date: string | null;
          multiple: number | null;
          organization_id: string | null;
          party_id: number | null;
          party_name: string | null;
          post_money_valuation: number | null;
          security_id: number | null;
          security_type: string | null;
          series_name: string | null;
          total_units: number | null;
        };
        Relationships: [
          {
            foreignKeyName: 'investor_party_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'mcp_distinct_orgs';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'investor_party_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'investor_position_lot_party_id_fkey';
            columns: ['party_id'];
            isOneToOne: false;
            referencedRelation: 'investor_party';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'investor_position_lot_security_id_fkey';
            columns: ['security_id'];
            isOneToOne: false;
            referencedRelation: 'investor_security';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'investor_security_entity_id_fkey';
            columns: ['entity_id'];
            isOneToOne: false;
            referencedRelation: 'module_entities';
            referencedColumns: ['id'];
          },
        ];
      };
      mcp_distinct_orgs: {
        Row: {
          id: string | null;
          is_demo_org: boolean | null;
          name: string | null;
        };
        Relationships: [];
      };
      mcp_distinct_tool_names: {
        Row: {
          tool_name: string | null;
        };
        Relationships: [];
      };
      v_inv_board: {
        Row: {
          board_size: number | null;
          company_id: number | null;
          company_name: string | null;
          current_members: string | null;
          global_company_id: number | null;
          observer_count: number | null;
          organization_id: string | null;
          our_seats: number | null;
        };
        Relationships: [
          {
            foreignKeyName: 'inv_board_seat_company_id_fkey';
            columns: ['company_id'];
            isOneToOne: false;
            referencedRelation: 'inv_company';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'inv_board_seat_company_id_fkey';
            columns: ['company_id'];
            isOneToOne: false;
            referencedRelation: 'v_inv_company_valuation';
            referencedColumns: ['company_id'];
          },
          {
            foreignKeyName: 'inv_board_seat_company_id_fkey';
            columns: ['company_id'];
            isOneToOne: false;
            referencedRelation: 'v_inv_info_rights_schedule';
            referencedColumns: ['company_id'];
          },
          {
            foreignKeyName: 'inv_board_seat_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'mcp_distinct_orgs';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'inv_board_seat_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'inv_company_company_id_fkey';
            columns: ['global_company_id'];
            isOneToOne: false;
            referencedRelation: 'inv_companies';
            referencedColumns: ['id'];
          },
        ];
      };
      v_inv_co_investor_network: {
        Row: {
          companies_coinvested: number | null;
          company_names: string[] | null;
          investor_name: string | null;
          investor_type: string | null;
          last_coinvestment_date: string | null;
          organization_id: string | null;
          rounds_participated: number | null;
          times_led: number | null;
          total_coinvested: number | null;
        };
        Relationships: [
          {
            foreignKeyName: 'inv_co_investor_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'mcp_distinct_orgs';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'inv_co_investor_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
        ];
      };
      v_inv_company_valuation: {
        Row: {
          aggregate_cost: number | null;
          company_domain: string | null;
          company_id: number | null;
          company_name: string | null;
          current_price_unit: number | null;
          current_stage_code: string | null;
          current_stage_display_name: string | null;
          entry_amount: number | null;
          entry_date: string | null;
          entry_stage_code: string | null;
          entry_stage_display_name: string | null;
          fully_diluted_total: number | null;
          fund_ids: number[] | null;
          fund_names: string[] | null;
          fund_short_names: string[] | null;
          global_company_id: number | null;
          headquarters: string | null;
          industry: string | null;
          last_transaction_date: string | null;
          ma_carried_cost: number | null;
          ma_event_date: string | null;
          ma_excluded_share: number | null;
          multiple: number | null;
          my_fd_pct: number | null;
          my_fmv: number | null;
          my_units: number | null;
          organization_id: string | null;
          ownership_pct: number | null;
          post_money_valuation: number | null;
          primary_fund_name: string | null;
          primary_fund_short_name: string | null;
          realized_proceeds: number | null;
          sector: string | null;
          snapshot_date: string | null;
          status: string | null;
          total_equity_financing: number | null;
        };
        Relationships: [
          {
            foreignKeyName: 'inv_company_company_id_fkey';
            columns: ['global_company_id'];
            isOneToOne: false;
            referencedRelation: 'inv_companies';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'inv_company_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'mcp_distinct_orgs';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'inv_company_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
        ];
      };
      v_inv_fund_summary: {
        Row: {
          companies_count: number | null;
          currency: string | null;
          fund_id: number | null;
          fund_name: string | null;
          organization_id: string | null;
          positions_count: number | null;
          total_invested: number | null;
          total_units: number | null;
        };
        Relationships: [
          {
            foreignKeyName: 'inv_transaction_fund_id_fkey';
            columns: ['fund_id'];
            isOneToOne: false;
            referencedRelation: 'inv_fund';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'inv_transaction_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'mcp_distinct_orgs';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'inv_transaction_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
        ];
      };
      v_inv_info_rights_schedule: {
        Row: {
          audited_year_end: boolean | null;
          cap_table_access: boolean | null;
          company_domain: string | null;
          company_id: number | null;
          company_name: string | null;
          global_company_id: number | null;
          is_major_investor: boolean | null;
          monthly_balance_sheet: boolean | null;
          monthly_timing_days: number | null;
          organization_id: string | null;
          quarterly_balance_sheet: boolean | null;
          quarterly_timing_days: number | null;
          reporting_contact_email: string | null;
          reporting_contact_name: string | null;
          year_end_balance_sheet: boolean | null;
          year_end_timing_days: number | null;
        };
        Relationships: [
          {
            foreignKeyName: 'inv_company_company_id_fkey';
            columns: ['global_company_id'];
            isOneToOne: false;
            referencedRelation: 'inv_companies';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'inv_information_rights_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'mcp_distinct_orgs';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'inv_information_rights_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
        ];
      };
      v_inv_position: {
        Row: {
          avg_cost_per_unit: number | null;
          company_domain: string | null;
          company_id: number | null;
          company_name: string | null;
          company_status: string | null;
          currency: string | null;
          first_acquired: string | null;
          fund_id: number | null;
          fund_name: string | null;
          global_company_id: number | null;
          last_transaction: string | null;
          organization_id: string | null;
          realized_proceeds: number | null;
          security_id: number | null;
          security_name: string | null;
          security_type: string | null;
          total_cost: number | null;
          total_units: number | null;
        };
        Relationships: [
          {
            foreignKeyName: 'inv_company_company_id_fkey';
            columns: ['global_company_id'];
            isOneToOne: false;
            referencedRelation: 'inv_companies';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'inv_transaction_company_id_fkey';
            columns: ['company_id'];
            isOneToOne: false;
            referencedRelation: 'inv_company';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'inv_transaction_company_id_fkey';
            columns: ['company_id'];
            isOneToOne: false;
            referencedRelation: 'v_inv_company_valuation';
            referencedColumns: ['company_id'];
          },
          {
            foreignKeyName: 'inv_transaction_company_id_fkey';
            columns: ['company_id'];
            isOneToOne: false;
            referencedRelation: 'v_inv_info_rights_schedule';
            referencedColumns: ['company_id'];
          },
          {
            foreignKeyName: 'inv_transaction_fund_id_fkey';
            columns: ['fund_id'];
            isOneToOne: false;
            referencedRelation: 'inv_fund';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'inv_transaction_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'mcp_distinct_orgs';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'inv_transaction_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'inv_transaction_security_id_fkey';
            columns: ['security_id'];
            isOneToOne: false;
            referencedRelation: 'inv_security';
            referencedColumns: ['id'];
          },
        ];
      };
      v_inv_round_totals: {
        Row: {
          company_id: number | null;
          currency: string | null;
          final_close_date: string | null;
          financing_round_id: number | null;
          organization_id: string | null;
          our_funds_count: number | null;
          post_money_valuation: number | null;
          pre_money_valuation: number | null;
          round_name: string | null;
          stage: string | null;
          total_raised: number | null;
        };
        Relationships: [
          {
            foreignKeyName: 'inv_financing_round_company_id_fkey';
            columns: ['company_id'];
            isOneToOne: false;
            referencedRelation: 'inv_company';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'inv_financing_round_company_id_fkey';
            columns: ['company_id'];
            isOneToOne: false;
            referencedRelation: 'v_inv_company_valuation';
            referencedColumns: ['company_id'];
          },
          {
            foreignKeyName: 'inv_financing_round_company_id_fkey';
            columns: ['company_id'];
            isOneToOne: false;
            referencedRelation: 'v_inv_info_rights_schedule';
            referencedColumns: ['company_id'];
          },
          {
            foreignKeyName: 'inv_financing_round_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'mcp_distinct_orgs';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'inv_financing_round_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
        ];
      };
    };
    Functions: {
      admin_activity_logs: {
        Args: {
          p_action?: string;
          p_date_from?: string;
          p_date_to?: string;
          p_limit?: number;
          p_module?: string;
          p_offset?: number;
          p_org_type?: string;
          p_organization_id?: string;
          p_search?: string;
          p_user_id?: string;
        };
        Returns: {
          action: string;
          contract_status: string;
          counterparty: string;
          detail: string;
          doc_type: string;
          file_name: string;
          is_demo_org: boolean;
          is_internal_user: boolean;
          module: string;
          organization_id: string;
          organization_name: string;
          resource_id: string;
          resource_type: string;
          source: string;
          source_id: string;
          total_count: number;
          ts: string;
          user_email: string;
          user_id: string;
          user_name: string;
        }[];
      };
      admin_activity_logs_refresh: { Args: never; Returns: undefined };
      admin_fetch_user_auth_data: {
        Args: { p_user_id?: string };
        Returns: {
          created_at: string;
          email_confirmed_at: string;
          id: string;
          last_active_at: string;
          last_sign_in_at: string;
        }[];
      };
      admin_org_last_sign_in: {
        Args: never;
        Returns: {
          last_active_at: string;
          last_sign_in_at: string;
          org_id: string;
        }[];
      };
      admin_org_module_monthly_refresh: { Args: never; Returns: undefined };
      admin_org_module_uploads_refresh: { Args: never; Returns: undefined };
      admin_refresh_org_metrics_monthly: {
        Args: { p_month: string };
        Returns: number;
      };
      admin_upload_bucket_cpm: {
        Args: {
          ai_extraction_status: string;
          is_duplicate: boolean;
          status_id: number;
        };
        Returns: string;
      };
      admin_upload_bucket_investor: {
        Args: {
          ai_extraction_status: string;
          failure_error_code: string;
          status_id: number;
        };
        Returns: string;
      };
      assert_same_org_uuid:
        | {
            Args: { _bigint: number; _org: string; _tbl: string };
            Returns: undefined;
          }
        | {
            Args: {
              _id_bigint?: number;
              _id_uuid?: string;
              _org: string;
              _tbl: string;
            };
            Returns: undefined;
          };
      audit_auth_user_change: {
        Args: {
          p_action: string;
          p_metadata?: Json;
          p_new_data?: Json;
          p_old_data?: Json;
          p_user_id: string;
        };
        Returns: undefined;
      };
      authorize: {
        Args: {
          requested_permission: Database['public']['Enums']['app_permission'];
        };
        Returns: boolean;
      };
      check_expired_contracts: {
        Args: never;
        Returns: {
          contract_id: number;
          end_date: string;
          new_status: Database['public']['Enums']['contract_status'];
          old_status: Database['public']['Enums']['contract_status'];
        }[];
      };
      cleanup_noisy_integration_sync_logs: { Args: never; Returns: undefined };
      contract_relationship_canonical_vendor: {
        Args: { p_vendor_id: number };
        Returns: number;
      };
      contract_relationship_vendors_related: {
        Args: { p_vendor_a: number; p_vendor_b: number };
        Returns: boolean;
      };
      contract_search: {
        Args: { '': Database['public']['Tables']['contracts']['Row'] };
        Returns: {
          error: true;
        } & 'the function public.contract_search with parameter or with a single unnamed json/jsonb parameter, but no matches were found in the schema cache';
      };
      contracts_visible_to: {
        Args: { p_organization_id: string; p_user_id: string };
        Returns: {
          id: number;
          perm: Database['public']['Enums']['permission_level'];
        }[];
      };
      create_audit_log: {
        Args: {
          p_action?: string;
          p_ip_address?: unknown;
          p_metadata?: Json;
          p_new_data?: Json;
          p_old_data?: Json;
          p_organization_id?: string;
          p_resource_id?: string;
          p_resource_type?: string;
          p_session_id?: string;
          p_user_agent?: string;
          p_user_id?: string;
        };
        Returns: number;
      };
      create_inv_value_override: {
        Args: {
          p_created_by: string;
          p_entity_id: number;
          p_entity_type: string;
          p_field_key: string;
          p_organization_id: string;
          p_original_value: Json;
          p_override_value: Json;
          p_reason: string;
        };
        Returns: {
          created_at: string;
          created_by: string;
          entity_id: number;
          entity_type: string;
          field_key: string;
          id: string;
          organization_id: string;
          original_value: Json;
          override_value: Json;
          reason: string;
          reverted_at: string | null;
          reverted_by: string | null;
        };
        SetofOptions: {
          from: '*';
          to: 'inv_value_overrides';
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      custom_access_token_hook: { Args: { event: Json }; Returns: Json };
      delete_user_sessions: { Args: { user_id: string }; Returns: undefined };
      fetch_vendor_data: { Args: { vendor_id: number }; Returns: string };
      folders_visible_to: {
        Args: { p_organization_id: string; p_user_id: string };
        Returns: {
          id: number;
          perm: Database['public']['Enums']['permission_level'];
        }[];
      };
      get_publishing_averages: {
        Args: never;
        Returns: {
          last_30_days_avg_seconds: number;
          last_30_days_count: number;
          overall_avg_seconds: number;
          overall_count: number;
        }[];
      };
      has_exchange_agreements_access: { Args: never; Returns: boolean };
      initialize_all_vendor_descriptions: {
        Args: never;
        Returns: {
          status: string;
          vendor_id: number;
        }[];
      };
      initialize_contract_dates: {
        Args: never;
        Returns: {
          activities: string | null;
          ai_extraction: Json | null;
          ai_extraction_status:
            | Database['public']['Enums']['ai_extraction_status']
            | null;
          ai_notes: string | null;
          ai_training_restrictions: string | null;
          ai_validation: Json | null;
          all_parties_signed: string | null;
          annual_increase: number | null;
          annual_increase_months: number | null;
          apply_to_overall_spend: boolean;
          arbitration_and_conflict_resolution: string | null;
          audit_requirements: string | null;
          auto_renewal: boolean | null;
          billing_frequency: string | null;
          business_group: string | null;
          business_justification: string | null;
          business_order: string | null;
          business_sponsor: Json | null;
          cancel_by_date: number | null;
          cancel_date: Json | null;
          cancellation_process: string | null;
          client_entity_id: number | null;
          cost_mitigation: string | null;
          created_at: string | null;
          currency: string | null;
          data_disposal_tnc: string | null;
          date_of_last_signature: string | null;
          decision_reason: string | null;
          derivative_works: string | null;
          discount: number | null;
          distribution_rights: string | null;
          doc_fully_executed: boolean | null;
          due_date: string | null;
          end_users: string | null;
          exclusivity_terms: string | null;
          execution_date: string | null;
          ext_validation: Json | null;
          external_integration_connection_id: string | null;
          external_invoice_id: string | null;
          external_invoice_status: string | null;
          external_source: string | null;
          folder_id: string | null;
          geo_restrictions: string | null;
          id: number;
          internal_external_users: string | null;
          invoice_status: Database['public']['Enums']['invoice_status'] | null;
          is_duplicate: boolean;
          last_synced_at: string | null;
          legacy_renewal_period: string | null;
          locked_by: string | null;
          locked_by_email: string | null;
          market_data_types: string | null;
          marketing_rights: string | null;
          metadata: Json | null;
          multi_year: boolean | null;
          number_of_users: string | null;
          open_ai_file_id: string | null;
          organization_id: string | null;
          other_attributes: Json | null;
          owner: string | null;
          payment_terms: string | null;
          permissions: string | null;
          postsig_notes: string | null;
          products_fees: Json | null;
          related_contract_id: number | null;
          renewal_period: number | null;
          renewal_type: string | null;
          required_signature_count: number | null;
          scope_of_use: string | null;
          security_awareness: string | null;
          service_level_agreements: string | null;
          status: Database['public']['Enums']['contract_status'];
          status_id: number | null;
          submitted_by: string | null;
          subscription_term: number | null;
          summary: string | null;
          suspension_of_service: string | null;
          term_end_date: Json | null;
          term_start_date: Json | null;
          tos_urls: Json | null;
          trying_to_update_another_doc: boolean | null;
          type_id: number | null;
          updated_at: string | null;
          user_id: string | null;
          vendor_id: number | null;
          vendor_location: string | null;
          will_not_renew: boolean | null;
          will_not_renew_meta: Json | null;
        }[];
        SetofOptions: {
          from: '*';
          to: 'contracts';
          isOneToOne: false;
          isSetofReturn: true;
        };
      };
      is_folder_admin: {
        Args: { p_org: string; p_user: string };
        Returns: boolean;
      };
      is_org_admin: {
        Args: { p_org: string; p_user: string };
        Returns: boolean;
      };
      kpi_extraction_documents_list: {
        Args: {
          p_dir: string;
          p_file_kind: string;
          p_limit: number;
          p_offset: number;
          p_organization_id: string;
          p_search: string;
          p_sort: string;
          p_status: string;
        };
        Returns: {
          company_id: number;
          company_name: string;
          created_at: string;
          document_type: string;
          extracted: boolean;
          file_kind: string;
          file_name: string;
          id: number;
          organization_id: string;
          organization_name: string;
          saved: boolean;
          saved_periods: Json;
          total: number;
        }[];
      };
      match_documents: {
        Args: {
          input_contract_id?: number;
          match_count?: number;
          match_threshold?: number;
          query_embedding: string;
        };
        Returns: {
          content: string;
          id: string;
          metadata: Json;
          similarity: number;
        }[];
      };
      mcp_authorization_summary: {
        Args: { p_authorization_id: string };
        Returns: {
          client_id: string;
          expires_at: string;
          redirect_uri: string;
          resource: string;
          status: string;
        }[];
      };
      mcp_tool_calls_stats: {
        Args: {
          p_date_from?: string;
          p_date_to?: string;
          p_module?: string;
          p_org_type?: string;
          p_organization_id?: string;
          p_search?: string;
          p_status?: string;
          p_user_id?: string;
        };
        Returns: {
          avg_duration_ms: number;
          avg_request_bytes: number;
          avg_response_bytes: number;
          calls: number;
          error_count: number;
          tool_name: string;
          total_response_bytes: number;
        }[];
      };
      mcp_tool_calls_timeseries: {
        Args: {
          p_date_from?: string;
          p_date_to?: string;
          p_module?: string;
          p_org_type?: string;
          p_organization_id?: string;
          p_status?: string;
          p_tool_name?: string;
          p_user_id?: string;
        };
        Returns: {
          calls: number;
          day: string;
          error_count: number;
        }[];
      };
      mcp_tool_calls_user_stats: {
        Args: {
          p_date_from?: string;
          p_date_to?: string;
          p_module?: string;
          p_org_type?: string;
          p_organization_id?: string;
          p_search?: string;
          p_status?: string;
          p_user_id?: string;
        };
        Returns: {
          avg_duration_ms: number;
          calls: number;
          distinct_tools: number;
          error_count: number;
          last_call_at: string;
          organization_id: string;
          organization_name: string;
          total_request_bytes: number;
          total_response_bytes: number;
          user_id: string;
          user_name: string;
        }[];
      };
      merge_contract_lineage: {
        Args: { p_contract_id: number; p_lineage_patch: Json };
        Returns: undefined;
      };
      merge_round_terms_raw: {
        Args: {
          p_effective_date: string;
          p_new_terms: Json;
          p_org_id: string;
          p_round_id: number;
        };
        Returns: undefined;
      };
      merge_security_metadata: {
        Args: { p_new_metadata: Json; p_org_id: string; p_security_id: number };
        Returns: undefined;
      };
      merge_security_terms_raw_terms: {
        Args: {
          p_effective_date: string;
          p_new_raw_terms: Json;
          p_org_id: string;
          p_security_id: number;
        };
        Returns: undefined;
      };
      record_inv_history: {
        Args: {
          p_action: string;
          p_changes: Json;
          p_created_by: string;
          p_organization_id: string;
          p_reason: string;
          p_row_id: number;
          p_table_name: string;
        };
        Returns: number;
      };
      redact_sensitive_jsonb: {
        Args: { data: Json; keys_to_redact: string[] };
        Returns: Json;
      };
      renew_expired_contracts: {
        Args: {
          p_contract_ids: number[];
          p_new_status: Database['public']['Enums']['contract_status'];
        };
        Returns: {
          activities: string | null;
          ai_extraction: Json | null;
          ai_extraction_status:
            | Database['public']['Enums']['ai_extraction_status']
            | null;
          ai_notes: string | null;
          ai_training_restrictions: string | null;
          ai_validation: Json | null;
          all_parties_signed: string | null;
          annual_increase: number | null;
          annual_increase_months: number | null;
          apply_to_overall_spend: boolean;
          arbitration_and_conflict_resolution: string | null;
          audit_requirements: string | null;
          auto_renewal: boolean | null;
          billing_frequency: string | null;
          business_group: string | null;
          business_justification: string | null;
          business_order: string | null;
          business_sponsor: Json | null;
          cancel_by_date: number | null;
          cancel_date: Json | null;
          cancellation_process: string | null;
          client_entity_id: number | null;
          cost_mitigation: string | null;
          created_at: string | null;
          currency: string | null;
          data_disposal_tnc: string | null;
          date_of_last_signature: string | null;
          decision_reason: string | null;
          derivative_works: string | null;
          discount: number | null;
          distribution_rights: string | null;
          doc_fully_executed: boolean | null;
          due_date: string | null;
          end_users: string | null;
          exclusivity_terms: string | null;
          execution_date: string | null;
          ext_validation: Json | null;
          external_integration_connection_id: string | null;
          external_invoice_id: string | null;
          external_invoice_status: string | null;
          external_source: string | null;
          folder_id: string | null;
          geo_restrictions: string | null;
          id: number;
          internal_external_users: string | null;
          invoice_status: Database['public']['Enums']['invoice_status'] | null;
          is_duplicate: boolean;
          last_synced_at: string | null;
          legacy_renewal_period: string | null;
          locked_by: string | null;
          locked_by_email: string | null;
          market_data_types: string | null;
          marketing_rights: string | null;
          metadata: Json | null;
          multi_year: boolean | null;
          number_of_users: string | null;
          open_ai_file_id: string | null;
          organization_id: string | null;
          other_attributes: Json | null;
          owner: string | null;
          payment_terms: string | null;
          permissions: string | null;
          postsig_notes: string | null;
          products_fees: Json | null;
          related_contract_id: number | null;
          renewal_period: number | null;
          renewal_type: string | null;
          required_signature_count: number | null;
          scope_of_use: string | null;
          security_awareness: string | null;
          service_level_agreements: string | null;
          status: Database['public']['Enums']['contract_status'];
          status_id: number | null;
          submitted_by: string | null;
          subscription_term: number | null;
          summary: string | null;
          suspension_of_service: string | null;
          term_end_date: Json | null;
          term_start_date: Json | null;
          tos_urls: Json | null;
          trying_to_update_another_doc: boolean | null;
          type_id: number | null;
          updated_at: string | null;
          user_id: string | null;
          vendor_id: number | null;
          vendor_location: string | null;
          will_not_renew: boolean | null;
          will_not_renew_meta: Json | null;
        }[];
        SetofOptions: {
          from: '*';
          to: 'contracts';
          isOneToOne: false;
          isSetofReturn: true;
        };
      };
      replace_document_type_fields: {
        Args: {
          p_document_type_ids: number[];
          p_master_field_definition_id: string;
        };
        Returns: {
          created_at: string;
          document_type_id: number;
          id: string;
          master_field_definition_id: string;
          updated_at: string;
        }[];
        SetofOptions: {
          from: '*';
          to: 'document_type_fields';
          isOneToOne: false;
          isSetofReturn: true;
        };
      };
      replace_fee_schedule_line_items: {
        Args: { p_rows: Json; p_version_id: number };
        Returns: undefined;
      };
      run_daily_contract_updates: { Args: never; Returns: undefined };
      set_contract_order_number: {
        Args: {
          p_contract_id: number;
          p_only_if_empty: boolean;
          p_order_number: string;
        };
        Returns: undefined;
      };
      show_limit: { Args: never; Returns: number };
      show_trgm: { Args: { '': string }; Returns: string[] };
      text2ltree: { Args: { '': string }; Returns: unknown };
      update_corporate_event_raw: {
        Args: {
          p_event_id: number;
          p_org_id: string;
          p_parties?: Json;
          p_patch?: Json;
        };
        Returns: boolean;
      };
      update_current_dates: { Args: never; Returns: undefined };
      update_demo_contracts: { Args: never; Returns: undefined };
      user_has_role_in_org: {
        Args: { p_org: string; p_roles: number[]; p_user: string };
        Returns: boolean;
      };
      user_organization_id: { Args: never; Returns: string };
      users_who_can_see_contracts: {
        Args: { p_contract_ids: number[]; p_organization_id: string };
        Returns: {
          contract_id: number;
          email: string;
          name: string;
          organization_id: string;
          perm: Database['public']['Enums']['permission_level'];
          permission_sources: string[];
          signed_up: boolean;
          user_id: string;
        }[];
      };
      vendor_merge_apply: {
        Args: {
          p_allow_reference_drops?: boolean;
          p_loser: number;
          p_survivor: number;
        };
        Returns: Json;
      };
      vendor_merge_move_product_refs: {
        Args: { p_from_product: number; p_to_product: number };
        Returns: Json;
      };
      vendor_merge_preview: {
        Args: { p_loser: number; p_survivor: number };
        Returns: Json;
      };
    };
    Enums: {
      ai_extraction_status:
        | 'ai_success'
        | 'ai_failed'
        | 'h_success'
        | 'h_failed'
        | 'ext_failed'
        | 'ext_success'
        | 'rerunning'
        | 'rerun_queued';
      app_permission:
        | 'contracts.select'
        | 'contracts.update'
        | 'contracts.delete'
        | 'contracts.insert'
        | 'vendor_products.select'
        | 'vendor_products.update'
        | 'vendor_products.delete'
        | 'vendor_products.insert'
        | 'vendor_products_details.select'
        | 'vendor_products_details.update'
        | 'vendor_products_details.delete'
        | 'vendor_products_details.insert'
        | 'contract_docs.select'
        | 'contract_docs.insert'
        | 'contract_docs.update'
        | 'activities.select'
        | 'activities.insert'
        | 'activities.update'
        | 'contract_statuses.select'
        | 'contract_types.select';
      app_role: 'admin' | 'user' | 'extractor' | 'demo';
      comment_order: 'newest_first' | 'oldest_first';
      CompanyStatus: 'active' | 'inactive' | 'merged' | 'acquired';
      contract_status: 'unconfirmed' | 'active' | 'inactive';
      CorporateActionType: 'merger' | 'acquisition' | 'name_change' | 'spinoff';
      integration_provider: 'xero' | 'ramp' | 'docusign';
      invoice_status:
        | 'review'
        | 'incomplete'
        | 'declined'
        | 'void'
        | 'paid'
        | 'approved';
      organization_status: 'active' | 'inactive';
      permission_level: 'read' | 'write' | 'admin';
      prompt_candidate_status:
        | 'pending'
        | 'drafting'
        | 'refining'
        | 'evaluating'
        | 'finalized'
        | 'archived';
      VendorStatus: 'active' | 'inactive' | 'merged' | 'acquired' | 'duplicate';
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
  storage: {
    Tables: {
      buckets: {
        Row: {
          allowed_mime_types: string[] | null;
          avif_autodetection: boolean | null;
          created_at: string | null;
          file_size_limit: number | null;
          id: string;
          name: string;
          owner: string | null;
          owner_id: string | null;
          public: boolean | null;
          type: Database['storage']['Enums']['buckettype'];
          updated_at: string | null;
        };
        Insert: {
          allowed_mime_types?: string[] | null;
          avif_autodetection?: boolean | null;
          created_at?: string | null;
          file_size_limit?: number | null;
          id: string;
          name: string;
          owner?: string | null;
          owner_id?: string | null;
          public?: boolean | null;
          type?: Database['storage']['Enums']['buckettype'];
          updated_at?: string | null;
        };
        Update: {
          allowed_mime_types?: string[] | null;
          avif_autodetection?: boolean | null;
          created_at?: string | null;
          file_size_limit?: number | null;
          id?: string;
          name?: string;
          owner?: string | null;
          owner_id?: string | null;
          public?: boolean | null;
          type?: Database['storage']['Enums']['buckettype'];
          updated_at?: string | null;
        };
        Relationships: [];
      };
      buckets_analytics: {
        Row: {
          created_at: string;
          deleted_at: string | null;
          format: string;
          id: string;
          name: string;
          type: Database['storage']['Enums']['buckettype'];
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          deleted_at?: string | null;
          format?: string;
          id?: string;
          name: string;
          type?: Database['storage']['Enums']['buckettype'];
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          deleted_at?: string | null;
          format?: string;
          id?: string;
          name?: string;
          type?: Database['storage']['Enums']['buckettype'];
          updated_at?: string;
        };
        Relationships: [];
      };
      buckets_vectors: {
        Row: {
          created_at: string;
          id: string;
          type: Database['storage']['Enums']['buckettype'];
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          id: string;
          type?: Database['storage']['Enums']['buckettype'];
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          type?: Database['storage']['Enums']['buckettype'];
          updated_at?: string;
        };
        Relationships: [];
      };
      iceberg_namespaces: {
        Row: {
          bucket_name: string;
          catalog_id: string;
          created_at: string;
          id: string;
          metadata: Json;
          name: string;
          updated_at: string;
        };
        Insert: {
          bucket_name: string;
          catalog_id: string;
          created_at?: string;
          id?: string;
          metadata?: Json;
          name: string;
          updated_at?: string;
        };
        Update: {
          bucket_name?: string;
          catalog_id?: string;
          created_at?: string;
          id?: string;
          metadata?: Json;
          name?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'iceberg_namespaces_catalog_id_fkey';
            columns: ['catalog_id'];
            isOneToOne: false;
            referencedRelation: 'buckets_analytics';
            referencedColumns: ['id'];
          },
        ];
      };
      iceberg_tables: {
        Row: {
          bucket_name: string;
          catalog_id: string;
          created_at: string;
          id: string;
          location: string;
          name: string;
          namespace_id: string;
          remote_table_id: string | null;
          shard_id: string | null;
          shard_key: string | null;
          updated_at: string;
        };
        Insert: {
          bucket_name: string;
          catalog_id: string;
          created_at?: string;
          id?: string;
          location: string;
          name: string;
          namespace_id: string;
          remote_table_id?: string | null;
          shard_id?: string | null;
          shard_key?: string | null;
          updated_at?: string;
        };
        Update: {
          bucket_name?: string;
          catalog_id?: string;
          created_at?: string;
          id?: string;
          location?: string;
          name?: string;
          namespace_id?: string;
          remote_table_id?: string | null;
          shard_id?: string | null;
          shard_key?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'iceberg_tables_catalog_id_fkey';
            columns: ['catalog_id'];
            isOneToOne: false;
            referencedRelation: 'buckets_analytics';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'iceberg_tables_namespace_id_fkey';
            columns: ['namespace_id'];
            isOneToOne: false;
            referencedRelation: 'iceberg_namespaces';
            referencedColumns: ['id'];
          },
        ];
      };
      migrations: {
        Row: {
          executed_at: string | null;
          hash: string;
          id: number;
          name: string;
        };
        Insert: {
          executed_at?: string | null;
          hash: string;
          id: number;
          name: string;
        };
        Update: {
          executed_at?: string | null;
          hash?: string;
          id?: number;
          name?: string;
        };
        Relationships: [];
      };
      objects: {
        Row: {
          bucket_id: string | null;
          created_at: string | null;
          id: string;
          last_accessed_at: string | null;
          level: number | null;
          metadata: Json | null;
          name: string | null;
          owner: string | null;
          owner_id: string | null;
          path_tokens: string[] | null;
          updated_at: string | null;
          user_metadata: Json | null;
          version: string | null;
        };
        Insert: {
          bucket_id?: string | null;
          created_at?: string | null;
          id?: string;
          last_accessed_at?: string | null;
          level?: number | null;
          metadata?: Json | null;
          name?: string | null;
          owner?: string | null;
          owner_id?: string | null;
          path_tokens?: string[] | null;
          updated_at?: string | null;
          user_metadata?: Json | null;
          version?: string | null;
        };
        Update: {
          bucket_id?: string | null;
          created_at?: string | null;
          id?: string;
          last_accessed_at?: string | null;
          level?: number | null;
          metadata?: Json | null;
          name?: string | null;
          owner?: string | null;
          owner_id?: string | null;
          path_tokens?: string[] | null;
          updated_at?: string | null;
          user_metadata?: Json | null;
          version?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'objects_bucketId_fkey';
            columns: ['bucket_id'];
            isOneToOne: false;
            referencedRelation: 'buckets';
            referencedColumns: ['id'];
          },
        ];
      };
      prefixes: {
        Row: {
          bucket_id: string;
          created_at: string | null;
          level: number;
          name: string;
          updated_at: string | null;
        };
        Insert: {
          bucket_id: string;
          created_at?: string | null;
          level?: number;
          name: string;
          updated_at?: string | null;
        };
        Update: {
          bucket_id?: string;
          created_at?: string | null;
          level?: number;
          name?: string;
          updated_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'prefixes_bucketId_fkey';
            columns: ['bucket_id'];
            isOneToOne: false;
            referencedRelation: 'buckets';
            referencedColumns: ['id'];
          },
        ];
      };
      s3_multipart_uploads: {
        Row: {
          bucket_id: string;
          created_at: string;
          id: string;
          in_progress_size: number;
          key: string;
          owner_id: string | null;
          upload_signature: string;
          user_metadata: Json | null;
          version: string;
        };
        Insert: {
          bucket_id: string;
          created_at?: string;
          id: string;
          in_progress_size?: number;
          key: string;
          owner_id?: string | null;
          upload_signature: string;
          user_metadata?: Json | null;
          version: string;
        };
        Update: {
          bucket_id?: string;
          created_at?: string;
          id?: string;
          in_progress_size?: number;
          key?: string;
          owner_id?: string | null;
          upload_signature?: string;
          user_metadata?: Json | null;
          version?: string;
        };
        Relationships: [
          {
            foreignKeyName: 's3_multipart_uploads_bucket_id_fkey';
            columns: ['bucket_id'];
            isOneToOne: false;
            referencedRelation: 'buckets';
            referencedColumns: ['id'];
          },
        ];
      };
      s3_multipart_uploads_parts: {
        Row: {
          bucket_id: string;
          created_at: string;
          etag: string;
          id: string;
          key: string;
          owner_id: string | null;
          part_number: number;
          size: number;
          upload_id: string;
          version: string;
        };
        Insert: {
          bucket_id: string;
          created_at?: string;
          etag: string;
          id?: string;
          key: string;
          owner_id?: string | null;
          part_number: number;
          size?: number;
          upload_id: string;
          version: string;
        };
        Update: {
          bucket_id?: string;
          created_at?: string;
          etag?: string;
          id?: string;
          key?: string;
          owner_id?: string | null;
          part_number?: number;
          size?: number;
          upload_id?: string;
          version?: string;
        };
        Relationships: [
          {
            foreignKeyName: 's3_multipart_uploads_parts_bucket_id_fkey';
            columns: ['bucket_id'];
            isOneToOne: false;
            referencedRelation: 'buckets';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 's3_multipart_uploads_parts_upload_id_fkey';
            columns: ['upload_id'];
            isOneToOne: false;
            referencedRelation: 's3_multipart_uploads';
            referencedColumns: ['id'];
          },
        ];
      };
      vector_indexes: {
        Row: {
          bucket_id: string;
          created_at: string;
          data_type: string;
          dimension: number;
          distance_metric: string;
          id: string;
          metadata_configuration: Json | null;
          name: string;
          updated_at: string;
        };
        Insert: {
          bucket_id: string;
          created_at?: string;
          data_type: string;
          dimension: number;
          distance_metric: string;
          id?: string;
          metadata_configuration?: Json | null;
          name: string;
          updated_at?: string;
        };
        Update: {
          bucket_id?: string;
          created_at?: string;
          data_type?: string;
          dimension?: number;
          distance_metric?: string;
          id?: string;
          metadata_configuration?: Json | null;
          name?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'vector_indexes_bucket_id_fkey';
            columns: ['bucket_id'];
            isOneToOne: false;
            referencedRelation: 'buckets_vectors';
            referencedColumns: ['id'];
          },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      add_prefixes: {
        Args: { _bucket_id: string; _name: string };
        Returns: undefined;
      };
      can_insert_object: {
        Args: { bucketid: string; metadata: Json; name: string; owner: string };
        Returns: undefined;
      };
      delete_leaf_prefixes: {
        Args: { bucket_ids: string[]; names: string[] };
        Returns: undefined;
      };
      delete_prefix: {
        Args: { _bucket_id: string; _name: string };
        Returns: boolean;
      };
      extension: { Args: { name: string }; Returns: string };
      filename: { Args: { name: string }; Returns: string };
      foldername: { Args: { name: string }; Returns: string[] };
      get_level: { Args: { name: string }; Returns: number };
      get_prefix: { Args: { name: string }; Returns: string };
      get_prefixes: { Args: { name: string }; Returns: string[] };
      get_size_by_bucket: {
        Args: never;
        Returns: {
          bucket_id: string;
          size: number;
        }[];
      };
      list_multipart_uploads_with_delimiter: {
        Args: {
          bucket_id: string;
          delimiter_param: string;
          max_keys?: number;
          next_key_token?: string;
          next_upload_token?: string;
          prefix_param: string;
        };
        Returns: {
          created_at: string;
          id: string;
          key: string;
        }[];
      };
      list_objects_with_delimiter: {
        Args: {
          bucket_id: string;
          delimiter_param: string;
          max_keys?: number;
          next_token?: string;
          prefix_param: string;
          start_after?: string;
        };
        Returns: {
          id: string;
          metadata: Json;
          name: string;
          updated_at: string;
        }[];
      };
      lock_top_prefixes: {
        Args: { bucket_ids: string[]; names: string[] };
        Returns: undefined;
      };
      operation: { Args: never; Returns: string };
      search: {
        Args: {
          bucketname: string;
          levels?: number;
          limits?: number;
          offsets?: number;
          prefix: string;
          search?: string;
          sortcolumn?: string;
          sortorder?: string;
        };
        Returns: {
          created_at: string;
          id: string;
          last_accessed_at: string;
          metadata: Json;
          name: string;
          updated_at: string;
        }[];
      };
      search_legacy_v1: {
        Args: {
          bucketname: string;
          levels?: number;
          limits?: number;
          offsets?: number;
          prefix: string;
          search?: string;
          sortcolumn?: string;
          sortorder?: string;
        };
        Returns: {
          created_at: string;
          id: string;
          last_accessed_at: string;
          metadata: Json;
          name: string;
          updated_at: string;
        }[];
      };
      search_v1_optimised: {
        Args: {
          bucketname: string;
          levels?: number;
          limits?: number;
          offsets?: number;
          prefix: string;
          search?: string;
          sortcolumn?: string;
          sortorder?: string;
        };
        Returns: {
          created_at: string;
          id: string;
          last_accessed_at: string;
          metadata: Json;
          name: string;
          updated_at: string;
        }[];
      };
      search_v2: {
        Args: {
          bucket_name: string;
          levels?: number;
          limits?: number;
          prefix: string;
          sort_column?: string;
          sort_column_after?: string;
          sort_order?: string;
          start_after?: string;
        };
        Returns: {
          created_at: string;
          id: string;
          key: string;
          last_accessed_at: string;
          metadata: Json;
          name: string;
          updated_at: string;
        }[];
      };
    };
    Enums: {
      buckettype: 'STANDARD' | 'ANALYTICS' | 'VECTOR';
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>;

type DefaultSchema = DatabaseWithoutInternals[Extract<
  keyof Database,
  'public'
>];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema['Tables'] &
        DefaultSchema['Views'])
    ? (DefaultSchema['Tables'] &
        DefaultSchema['Views'])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema['Tables']
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema['Tables']
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema['Enums']
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums']
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums'][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema['Enums']
    ? DefaultSchema['Enums'][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema['CompositeTypes']
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes']
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes'][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema['CompositeTypes']
    ? DefaultSchema['CompositeTypes'][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      ai_extraction_status: [
        'ai_success',
        'ai_failed',
        'h_success',
        'h_failed',
        'ext_failed',
        'ext_success',
        'rerunning',
        'rerun_queued',
      ],
      app_permission: [
        'contracts.select',
        'contracts.update',
        'contracts.delete',
        'contracts.insert',
        'vendor_products.select',
        'vendor_products.update',
        'vendor_products.delete',
        'vendor_products.insert',
        'vendor_products_details.select',
        'vendor_products_details.update',
        'vendor_products_details.delete',
        'vendor_products_details.insert',
        'contract_docs.select',
        'contract_docs.insert',
        'contract_docs.update',
        'activities.select',
        'activities.insert',
        'activities.update',
        'contract_statuses.select',
        'contract_types.select',
      ],
      app_role: ['admin', 'user', 'extractor', 'demo'],
      comment_order: ['newest_first', 'oldest_first'],
      CompanyStatus: ['active', 'inactive', 'merged', 'acquired'],
      contract_status: ['unconfirmed', 'active', 'inactive'],
      CorporateActionType: ['merger', 'acquisition', 'name_change', 'spinoff'],
      integration_provider: ['xero', 'ramp', 'docusign'],
      invoice_status: [
        'review',
        'incomplete',
        'declined',
        'void',
        'paid',
        'approved',
      ],
      organization_status: ['active', 'inactive'],
      permission_level: ['read', 'write', 'admin'],
      prompt_candidate_status: [
        'pending',
        'drafting',
        'refining',
        'evaluating',
        'finalized',
        'archived',
      ],
      VendorStatus: ['active', 'inactive', 'merged', 'acquired', 'duplicate'],
    },
  },
  storage: {
    Enums: {
      buckettype: ['STANDARD', 'ANALYTICS', 'VECTOR'],
    },
  },
} as const;
