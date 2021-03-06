# Copyright © Mapotempo, 2014-2016
#
# This file is part of Mapotempo.
#
# Mapotempo is free software. You can redistribute it and/or
# modify since you respect the terms of the GNU Affero General
# Public License as published by the Free Software Foundation,
# either version 3 of the License, or (at your option) any later version.
#
# Mapotempo is distributed in the hope that it will be useful, but WITHOUT
# ANY WARRANTY; without even the implied warranty of MERCHANTABILITY
# or FITNESS FOR A PARTICULAR PURPOSE.  See the Licenses for more details.
#
# You should have received a copy of the GNU Affero General Public License
# along with Mapotempo. If not, see:
# <http://www.gnu.org/licenses/agpl.html>
#
require 'coerce'

class V01::Destinations < Grape::API
  helpers SharedParams
  helpers do
    # Never trust parameters from the scary internet, only allow the white list through.
    def destination_params
      p = ActionController::Parameters.new(params)
      p = p[:destination] if p.key?(:destination)
      if p[:visits]
        p[:visits_attributes] = p[:visits]
      end
      if p[:visits_attributes]
        p[:visits_attributes].each do |hash|
          hash[:quantities] = Hash[hash[:quantities].map{ |q| [q[:deliverable_unit_id].to_s, q[:quantity]] }] if hash[:quantities] && hash[:quantities].is_a?(Array)

          # Deals with deprecated open and close
          hash[:open1] = hash.delete(:open) if !hash.key?(:open1) && hash.key?(:open)
          hash[:close1] = hash.delete(:close) if !hash.key?(:close1) && hash.key?(:close)
          # Deals with deprecated quantity
          if !hash[:quantities]
            # hash[:quantities] keys must be string here because of permit below
            hash[:quantities] = { current_customer.deliverable_units[0].id.to_s => hash.delete(:quantity) } if hash[:quantity] && current_customer.deliverable_units.size > 0
            if hash[:quantity1_1] || hash[:quantity1_2]
              hash[:quantities] = {}
              hash[:quantities].merge!({ current_customer.deliverable_units[0].id.to_s => hash.delete(:quantity1_1) }) if hash[:quantity1_1] && current_customer.deliverable_units.size > 0
              hash[:quantities].merge!({ current_customer.deliverable_units[1].id.to_s => hash.delete(:quantity1_2) }) if hash[:quantity1_2] && current_customer.deliverable_units.size > 1
            end
          end
        end
      end

      p.permit(:ref, :name, :street, :detail, :postalcode, :city, :state, :country, :lat, :lng, :comment, :phone_number, :geocoding_accuracy, :geocoding_level, tag_ids: [], visits_attributes: [:id, :ref, :take_over, :open1, :close1, :open2, :close2, :priority, tag_ids: [], quantities: current_customer.deliverable_units.map{ |du| du.id.to_s }])
    end

    ID_DESC = 'Id or the ref field value, then use "ref:[value]".'.freeze
  end

  resource :destinations do
    desc 'Fetch customer\'s destinations.',
      nickname: 'getDestinations',
      is_array: true,
      success: V01::Entities::Destination
    params do
      optional :ids, type: Array[String], desc: 'Select returned destinations by id separated with comma. You can specify ref (not containing comma) instead of id, in this case you have to add "ref:" before each ref, e.g. ref:ref1,ref:ref2,ref:ref3.', coerce_with: CoerceArrayString
    end
    get do
      destinations = if params.key?(:ids)
        current_customer.destinations.includes_visits.select{ |destination|
          params[:ids].any?{ |s| ParseIdsRefs.match(s, destination) }
        }
      else
        current_customer.destinations.includes_visits.load
      end
      present destinations, with: V01::Entities::Destination
    end

    desc 'Fetch destination.',
      nickname: 'getDestination',
      success: V01::Entities::Destination
    params do
      requires :id, type: String, desc: ID_DESC
    end
    get ':id' do
      id = ParseIdsRefs.read(params[:id])
      present current_customer.destinations.includes_visits.where(id).first!, with: V01::Entities::Destination
    end

    desc 'Create destination.',
      nickname: 'createDestination',
      success: V01::Entities::Destination
    params do
      use :params_from_entity, entity: V01::Entities::Destination.documentation.except(:id, :tag_ids).deep_merge(
        name: { required: true },
        geocoding_accuracy: { desc: 'Must be inside 0..1 range.' }
      )
      optional :tag_ids, type: Array[Integer], desc: 'Ids separated by comma.', coerce_with: CoerceArrayInteger, documentation: { param_type: 'form' }
    end
    post do
      destination = current_customer.destinations.build(destination_params)
      destination.save!
      current_customer.save!
      present destination, with: V01::Entities::Destination
    end

    desc 'Import destinations by upload a CSV file, by JSON or from TomTom.',
      detail: 'Import multiple destinations and visits. Use your internal and unique ids as a "reference" to automatically retrieve and update objects. If "route" key is provided for a visit or if a planning attribute is sent, a planning will be automatically created at the same time. If all "route" attibutes are blank or none attribute for planning is sent, only destinations and visits will be created/updated.',
      nickname: 'importDestinations',
      is_array: true,
      success: V01::Entities::Destination
    params do
      optional(:replace, type: Boolean)
      optional(:planning, type: Hash, desc: 'Planning definition in case of planning created in the same time of destinations import. Planning is created if "route" field is provided in CVS or Json.') do
        optional(:name, type: String)
        optional(:ref, type: String)
        optional(:date, type: String)
        optional(:vehicle_usage_set_id, type: Integer)
        optional(:zoning_ids, type: Array[Integer], desc: 'If a new zoning is specified before planning save, all visits will be affected to vehicles specified in zones.')
      end
      optional(:file, type: Rack::Multipart::UploadedFile, desc: 'CSV file, encoding, separator and line return automatically detected, with localized CSV header according to HTTP header Accept-Language.', documentation: {param_type: 'form'})
      optional(:destinations, type: Array[V01::Entities::DestinationImportJson], desc: 'In mutual exclusion with CSV file upload and remote.')
      optional(:remote, type: Symbol, values: [:tomtom])
      at_least_one_of :file, :destinations, :remote
    end
    put do
      if params[:planning]
        if params[:planning][:vehicle_usage_set_id]
          params[:planning][:vehicle_usage_set] = current_customer.vehicle_usage_sets.find(params[:planning][:vehicle_usage_set_id])
        end
        params[:planning].delete(:vehicle_usage_set_id)
        if params[:planning][:zoning_ids] && !params[:planning][:zoning_ids].empty?
          params[:planning][:zonings] = current_customer.zonings.find(params[:planning][:zoning_ids])
        end
        params[:planning].delete(:zoning_ids)
      end
      import = if params[:destinations]
        ImportJson.new(importer: ImporterDestinations.new(current_customer, params[:planning]), replace: params[:replace], json: params[:destinations])
      elsif params[:remote]
        case params[:remote]
        when :tomtom then ImportTomtom.new(importer: ImporterDestinations.new(current_customer, params[:planning]), customer: current_customer, replace: params[:replace])
        end
      else
        ImportCsv.new(importer: ImporterDestinations.new(current_customer, params[:planning]), replace: params[:replace], file: params[:file])
      end

      if import && import.valid? && (destinations = import.import(true))
        case params[:remote]
        when :tomtom then status 202
        else present destinations, with: V01::Entities::Destination
        end
      else
        error!({error: import && import.errors.full_messages}, 422)
      end
    end

    desc 'Update destination.',
      detail: 'If want to force geocoding for a new address, you have to send empty lat/lng with new address.',
      nickname: 'updateDestination',
      success: V01::Entities::Destination
    params do
      requires :id, type: String, desc: ID_DESC
      use :params_from_entity, entity: V01::Entities::Destination.documentation.except(:id, :tag_ids).deep_merge(
        geocoding_accuracy: { desc: 'Must be inside 0..1 range.' }
      )
      optional :tag_ids, type: Array[Integer], desc: 'Ids separated by comma.', coerce_with: CoerceArrayInteger, documentation: { param_type: 'form' }
    end
    put ':id' do
      id = ParseIdsRefs.read(params[:id])
      destination = current_customer.destinations.where(id).first!
      destination.assign_attributes(destination_params)
      destination.save!
      destination.customer.save! if destination.customer
      present destination, with: V01::Entities::Destination
    end

    desc 'Delete destination.',
      nickname: 'deleteDestination'
    params do
      requires :id, type: String, desc: ID_DESC
    end
    delete ':id' do
      id = ParseIdsRefs.read(params[:id])
      current_customer.destinations.where(id).first!.destroy
      status 204
    end

    desc 'Delete multiple destinations.',
      nickname: 'deleteDestinations'
    params do
      optional :ids, type: Array[String], desc: 'Ids separated by comma. You can specify ref (not containing comma) instead of id, in this case you have to add "ref:" before each ref, e.g. ref:ref1,ref:ref2,ref:ref3. If no Id is provided, all objects are deleted.', coerce_with: CoerceArrayString
    end
    delete do
      Destination.transaction do
        if params[:ids] && !params[:ids].empty?
          destinations = current_customer.destinations.select { |destination|
            params[:ids].any? { |s| ParseIdsRefs.match(s, destination) }
          }

          if current_customer.destinations.count == destinations.count
            current_customer.delete_all_destinations
          else
            destinations.each(&:destroy)
          end
        else
          current_customer.delete_all_destinations
        end
        status 204
      end
    end

    desc 'Geocode destination.',
      detail: 'Result of geocoding is not saved with this operation. You can use update operation to save the result of geocoding.',
      nickname: 'geocodeDestination',
      success: V01::Entities::Destination
    params do
      use :params_from_entity, entity: V01::Entities::Destination.documentation.except(:id, :lat, :lng, :geocoding_accuracy, :geocoding_level, :visits)
    end
    patch 'geocode' do
      destination = current_customer.destinations.build(destination_params.except(:id, :visits_attributes))
      destination.geocode
      present destination, with: V01::Entities::Destination
    end

    desc 'Reverse geocoding.',
      detail: 'Result of reverse geocoding is not saved with this operation.',
      nickname: 'reverseGeocodingDestination',
      entity: V01::Entities::Destination
    params do
      use :params_from_entity, entity: V01::Entities::Destination.documentation.except(:id, :street, :postalcode, :city, :state, :country, :visits)
    end
    patch 'reverse' do
      destination = current_customer.destinations.build(destination_params.except(:id, :visits_attributes))
      destination.reverse_geocoding(params[:lat], params[:lng])
    end

    if Mapotempo::Application.config.geocode_complete
      desc 'Auto completion on destination.',
        nickname: 'autocompleteDestination'
      params do
        use :params_from_entity, entity: V01::Entities::Destination.documentation.except(:id, :visits)
      end
      patch 'geocode_complete' do
        p = destination_params.except(:id, :visits_attributes)
        address_list = Mapotempo::Application.config.geocode_geocoder.complete(p[:street], p[:postalcode], p[:city], p[:state], p[:country] || current_customer.default_country, current_customer.stores[0].lat, current_customer.stores[0].lng)
        address_list = address_list.collect{ |i| {street: i[0], postalcode: i[1], city: i[2]} }
        address_list
      end
    end
  end
end
