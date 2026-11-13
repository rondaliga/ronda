package br.hospital.ronda;

import android.Manifest;
import android.content.Context;
import android.net.wifi.WifiInfo;
import android.net.wifi.WifiManager;

import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

/** Lê o BSSID (identificador do ponto de acesso) da rede Wi-Fi em que o aparelho está conectado. */
@CapacitorPlugin(
    name = "RondaWifi",
    permissions = { @Permission(alias = "location", strings = { Manifest.permission.ACCESS_FINE_LOCATION }) }
)
public class RondaWifiPlugin extends Plugin {

    @PluginMethod
    public void getBssid(PluginCall call) {
        if (getPermissionState("location") != PermissionState.GRANTED) {
            requestPermissionForAlias("location", call, "aoResponderLocalizacao");
            return;
        }
        ler(call);
    }

    @PermissionCallback
    private void aoResponderLocalizacao(PluginCall call) {
        if (getPermissionState("location") == PermissionState.GRANTED) {
            ler(call);
        } else {
            JSObject r = new JSObject();
            r.put("motivo", "permissao");
            call.resolve(r);
        }
    }

    private void ler(PluginCall call) {
        JSObject r = new JSObject();
        try {
            WifiManager wm = (WifiManager) getContext().getApplicationContext().getSystemService(Context.WIFI_SERVICE);
            WifiInfo info = wm == null ? null : wm.getConnectionInfo();
            String bssid = info == null ? null : info.getBSSID();
            if (bssid == null) {
                r.put("motivo", "semwifi");
            } else {
                r.put("valor", bssid);
            }
        } catch (Exception e) {
            r.put("motivo", "erro");
        }
        call.resolve(r);
    }
}
