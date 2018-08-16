# Copyright © Mapotempo, 2016
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
class FleetService < DeviceService
  def list_devices
    if customer.devices[service_name] && customer.devices[:fleet][:user]
      with_cache [:list_devices, service_name, customer.id, customer.devices[:fleet][:user]] do
        service.list_devices(customer)
      end
    else
      []
    end
  end

  def list_vehicles(params)
    if (customer.devices[service_name] && customer.devices[:fleet][:user]) || (params && params[:user])
      with_cache [:list_vehicles, service_name, customer.id, customer.devices[:fleet][:user]] do
        service.list_devices(customer, params)
      end
    else
      []
    end
  end

  def get_vehicles_pos
    if customer.devices[service_name] && customer.devices[:fleet][:user]
      with_cache [:get_vehicles_pos, service_name, customer.id, customer.devices[:fleet][:user]] do
        service.get_vehicles_pos(customer)
      end
    end
  end

  def fetch_stops_status(planning)
    # Key for cache is composed of :updated_at routes because planning will do operations by itself that can invalidate the data for 120 seconds
    key = [:fetch_stops, service_name, planning.customer.id, planning.id, planning.customer.devices[:fleet][:user], planning.routes.select(&:vehicle_usage?).map(&:updated_at)]
    with_cache(key) do
      planning.fetch_stops_status
    end
  end

  def fetch_routes_by_date(from, to)
    service.fetch_routes_by_date(customer, from, to)
  end

  def create_company
    if customer.devices[service_name]
      service.create_company(customer)
    end
  end

  def create_or_update_drivers(current_admin)
    service.create_or_update_drivers(customer, current_admin) if customer.devices[service_name] && customer.devices[:fleet][:user]
  end

  def clear_route(route)
    super(route)
    route.clear_eta_data
  end

  def clear_routes_by_external_ref(refs)
    service.clear_routes_by_external_ref(customer, refs.each(&:symbolize_keys))
  end
end
