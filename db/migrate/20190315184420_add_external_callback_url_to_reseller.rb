class AddExternalCallbackUrlToReseller < ActiveRecord::Migration
  def change
    add_column :resellers, :external_callback_url, :string
    add_column :resellers, :external_callback_url_name, :string
  end
end
