package br.hospital.ronda;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(RondaWifiPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
