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
          id: number;
          user_id: string | null;
        };
        Insert: {
          activity_data?: Json | null;
          activity_type?: string | null;
          contract_id?: number | null;
          created_at?: string | null;
          id?: number;
          user_id?: string | null;
        };
        Update: {
          activity_data?: Json | null;
          activity_type?: string | null;
          contract_id?: number | null;
          created_at?: string | null;
          id?: number;
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
            foreignKeyName: 'activities_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
        ];
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
            referencedRelation: 'organizations';
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
      contract_relationships: {
        Row: {
          active: boolean | null;
          child_contract_id: number | null;
          created_at: string | null;
          disabled: boolean | null;
          id: number;
          metadata: Json | null;
          organization_id: string;
          parent_contract_id: number | null;
          vendor_id: number | null;
        };
        Insert: {
          active?: boolean | null;
          child_contract_id?: number | null;
          created_at?: string | null;
          disabled?: boolean | null;
          id?: number;
          metadata?: Json | null;
          organization_id: string;
          parent_contract_id?: number | null;
          vendor_id?: number | null;
        };
        Update: {
          active?: boolean | null;
          child_contract_id?: number | null;
          created_at?: string | null;
          disabled?: boolean | null;
          id?: number;
          metadata?: Json | null;
          organization_id?: string;
          parent_contract_id?: number | null;
          vendor_id?: number | null;
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
            foreignKeyName: 'contract_relationships_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
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
          {
            foreignKeyName: 'contract_relationships_vendor_id_fkey';
            columns: ['vendor_id'];
            isOneToOne: false;
            referencedRelation: 'vendors';
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
          created_at: string;
          email: string | null;
          id: number;
          name: string;
          product_id: number | null;
          updated_at: string | null;
        };
        Insert: {
          contract_id?: number | null;
          created_at?: string;
          email?: string | null;
          id?: number;
          name: string;
          product_id?: number | null;
          updated_at?: string | null;
        };
        Update: {
          contract_id?: number | null;
          created_at?: string;
          email?: string | null;
          id?: number;
          name?: string;
          product_id?: number | null;
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
            foreignKeyName: 'contract_users_product_id_fkey';
            columns: ['product_id'];
            isOneToOne: false;
            referencedRelation: 'vendor_products';
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
          cost_mitigation: string | null;
          created_at: string | null;
          currency: string | null;
          data_disposal_tnc: string | null;
          date_of_last_signature: string | null;
          derivative_works: string | null;
          discount: number | null;
          distribution_rights: string | null;
          doc_fully_executed: boolean | null;
          end_users: string | null;
          exclusivity_terms: string | null;
          execution_date: string | null;
          ext_validation: Json | null;
          folder_id: string | null;
          geo_restrictions: string | null;
          id: number;
          internal_external_users: string | null;
          is_duplicate: boolean;
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
          cost_mitigation?: string | null;
          created_at?: string | null;
          currency?: string | null;
          data_disposal_tnc?: string | null;
          date_of_last_signature?: string | null;
          derivative_works?: string | null;
          discount?: number | null;
          distribution_rights?: string | null;
          doc_fully_executed?: boolean | null;
          end_users?: string | null;
          exclusivity_terms?: string | null;
          execution_date?: string | null;
          ext_validation?: Json | null;
          folder_id?: string | null;
          geo_restrictions?: string | null;
          id?: number;
          internal_external_users?: string | null;
          is_duplicate?: boolean;
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
          cost_mitigation?: string | null;
          created_at?: string | null;
          currency?: string | null;
          data_disposal_tnc?: string | null;
          date_of_last_signature?: string | null;
          derivative_works?: string | null;
          discount?: number | null;
          distribution_rights?: string | null;
          doc_fully_executed?: boolean | null;
          end_users?: string | null;
          exclusivity_terms?: string | null;
          execution_date?: string | null;
          ext_validation?: Json | null;
          folder_id?: string | null;
          geo_restrictions?: string | null;
          id?: number;
          internal_external_users?: string | null;
          is_duplicate?: boolean;
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
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
        ];
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
          updated_at?: string;
        };
        Relationships: [];
      };
      organization_vendor_settings: {
        Row: {
          created_at: string | null;
          organization_id: string;
          settings: Json;
          updated_at: string | null;
          vendor_id: number;
        };
        Insert: {
          created_at?: string | null;
          organization_id: string;
          settings?: Json;
          updated_at?: string | null;
          vendor_id: number;
        };
        Update: {
          created_at?: string | null;
          organization_id?: string;
          settings?: Json;
          updated_at?: string | null;
          vendor_id?: number;
        };
        Relationships: [
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
          domain: string | null;
          fiscal_year_start_month: number;
          id: string;
          is_demo_org: boolean | null;
          missing_clauses_confirmed: boolean;
          missing_clauses_settings: Json | null;
          name: string;
          trial: boolean | null;
          trial_ends_at: string | null;
          upload_app_access: boolean | null;
        };
        Insert: {
          app_access?: boolean | null;
          domain?: string | null;
          fiscal_year_start_month?: number;
          id?: string;
          is_demo_org?: boolean | null;
          missing_clauses_confirmed?: boolean;
          missing_clauses_settings?: Json | null;
          name: string;
          trial?: boolean | null;
          trial_ends_at?: string | null;
          upload_app_access?: boolean | null;
        };
        Update: {
          app_access?: boolean | null;
          domain?: string | null;
          fiscal_year_start_month?: number;
          id?: string;
          is_demo_org?: boolean | null;
          missing_clauses_confirmed?: boolean;
          missing_clauses_settings?: Json | null;
          name?: string;
          trial?: boolean | null;
          trial_ends_at?: string | null;
          upload_app_access?: boolean | null;
        };
        Relationships: [];
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
          updated_at: string;
        };
        Insert: {
          active_version_id?: string | null;
          created_at?: string;
          description?: string | null;
          group_key: string;
          id?: string;
          updated_at?: string;
        };
        Update: {
          active_version_id?: string | null;
          created_at?: string;
          description?: string | null;
          group_key?: string;
          id?: string;
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
          email_mfa_session_verified_at: string | null;
          ftux_status: Json | null;
          id: string;
          job_title: string | null;
          last_notified_date: string | null;
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
          email_mfa_session_verified_at?: string | null;
          ftux_status?: Json | null;
          id: string;
          job_title?: string | null;
          last_notified_date?: string | null;
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
          email_mfa_session_verified_at?: string | null;
          ftux_status?: Json | null;
          id?: string;
          job_title?: string | null;
          last_notified_date?: string | null;
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
            referencedRelation: 'organizations';
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
          updated_at: string | null;
          vendor_id: number;
        };
        Insert: {
          created_at?: string;
          delivery_method_id?: number | null;
          id?: number;
          name: string;
          updated_at?: string | null;
          vendor_id: number;
        };
        Update: {
          created_at?: string;
          delivery_method_id?: number | null;
          id?: number;
          name?: string;
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
          contract_id: number;
          created_at: string;
          fees: number | null;
          id: number;
          n_users: number | null;
          product_id: number;
          user_id: string | null;
          year: number;
        };
        Insert: {
          contract_id: number;
          created_at?: string;
          fees?: number | null;
          id?: number;
          n_users?: number | null;
          product_id: number;
          user_id?: string | null;
          year: number;
        };
        Update: {
          contract_id?: number;
          created_at?: string;
          fees?: number | null;
          id?: number;
          n_users?: number | null;
          product_id?: number;
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
      vendor_products_users: {
        Row: {
          contract_id: number | null;
          created_at: string;
          id: number;
          number_of_users: number | null;
          product_id: number | null;
          updated_at: string | null;
        };
        Insert: {
          contract_id?: number | null;
          created_at?: string;
          id?: number;
          number_of_users?: number | null;
          product_id?: number | null;
          updated_at?: string | null;
        };
        Update: {
          contract_id?: number | null;
          created_at?: string;
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
    };
    Functions: {
      admin_fetch_user_auth_data: {
        Args: never;
        Returns: {
          id: string;
          last_sign_in_at: string;
        }[];
      };
      admin_org_last_sign_in: {
        Args: never;
        Returns: {
          last_sign_in_at: string;
          org_id: string;
        }[];
      };
      assert_same_org_uuid:
        | {
            Args: {
              _id_bigint?: number;
              _id_uuid?: string;
              _org: string;
              _tbl: string;
            };
            Returns: undefined;
          }
        | {
            Args: { _bigint: number; _org: string; _tbl: string };
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
          cost_mitigation: string | null;
          created_at: string | null;
          currency: string | null;
          data_disposal_tnc: string | null;
          date_of_last_signature: string | null;
          derivative_works: string | null;
          discount: number | null;
          distribution_rights: string | null;
          doc_fully_executed: boolean | null;
          end_users: string | null;
          exclusivity_terms: string | null;
          execution_date: string | null;
          ext_validation: Json | null;
          folder_id: string | null;
          geo_restrictions: string | null;
          id: number;
          internal_external_users: string | null;
          is_duplicate: boolean;
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
          cost_mitigation: string | null;
          created_at: string | null;
          currency: string | null;
          data_disposal_tnc: string | null;
          date_of_last_signature: string | null;
          derivative_works: string | null;
          discount: number | null;
          distribution_rights: string | null;
          doc_fully_executed: boolean | null;
          end_users: string | null;
          exclusivity_terms: string | null;
          execution_date: string | null;
          ext_validation: Json | null;
          folder_id: string | null;
          geo_restrictions: string | null;
          id: number;
          internal_external_users: string | null;
          is_duplicate: boolean;
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
      run_daily_contract_updates: { Args: never; Returns: undefined };
      text2ltree: { Args: { '': string }; Returns: unknown };
      update_current_dates: { Args: never; Returns: undefined };
      update_demo_contracts: { Args: never; Returns: undefined };
      user_has_role_in_org: {
        Args: { p_org: string; p_roles: number[]; p_user: string };
        Returns: boolean;
      };
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
    };
    Enums: {
      ai_extraction_status:
        | 'ai_success'
        | 'ai_failed'
        | 'h_success'
        | 'h_failed'
        | 'ext_failed'
        | 'ext_success';
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
      contract_status: 'unconfirmed' | 'active' | 'inactive';
      CorporateActionType: 'merger' | 'acquisition' | 'name_change' | 'spinoff';
      permission_level: 'read' | 'write' | 'admin';
      prompt_candidate_status:
        | 'pending'
        | 'drafting'
        | 'refining'
        | 'evaluating'
        | 'finalized'
        | 'archived';
      VendorStatus: 'active' | 'inactive' | 'merged' | 'acquired';
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
          format: string;
          id: string;
          type: Database['storage']['Enums']['buckettype'];
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          format?: string;
          id: string;
          type?: Database['storage']['Enums']['buckettype'];
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          format?: string;
          id?: string;
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
          bucket_id: string;
          created_at: string;
          id: string;
          name: string;
          updated_at: string;
        };
        Insert: {
          bucket_id: string;
          created_at?: string;
          id?: string;
          name: string;
          updated_at?: string;
        };
        Update: {
          bucket_id?: string;
          created_at?: string;
          id?: string;
          name?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'iceberg_namespaces_bucket_id_fkey';
            columns: ['bucket_id'];
            isOneToOne: false;
            referencedRelation: 'buckets_analytics';
            referencedColumns: ['id'];
          },
        ];
      };
      iceberg_tables: {
        Row: {
          bucket_id: string;
          created_at: string;
          id: string;
          location: string;
          name: string;
          namespace_id: string;
          updated_at: string;
        };
        Insert: {
          bucket_id: string;
          created_at?: string;
          id?: string;
          location: string;
          name: string;
          namespace_id: string;
          updated_at?: string;
        };
        Update: {
          bucket_id?: string;
          created_at?: string;
          id?: string;
          location?: string;
          name?: string;
          namespace_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'iceberg_tables_bucket_id_fkey';
            columns: ['bucket_id'];
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
      contract_status: ['unconfirmed', 'active', 'inactive'],
      CorporateActionType: ['merger', 'acquisition', 'name_change', 'spinoff'],
      permission_level: ['read', 'write', 'admin'],
      prompt_candidate_status: [
        'pending',
        'drafting',
        'refining',
        'evaluating',
        'finalized',
        'archived',
      ],
      VendorStatus: ['active', 'inactive', 'merged', 'acquired'],
    },
  },
  storage: {
    Enums: {
      buckettype: ['STANDARD', 'ANALYTICS', 'VECTOR'],
    },
  },
} as const;
