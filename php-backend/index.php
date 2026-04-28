<?php
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: GET, POST, PUT, PATCH, DELETE, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Access-Control-Allow-Headers, Authorization, X-Requested-With");
header("Content-Type: application/json; charset=utf-8");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

require_once __DIR__ . '/config/database.php';
require_once __DIR__ . '/config/stateMachine.php';
require_once __DIR__ . '/controllers/RoomController.php';
require_once __DIR__ . '/controllers/CleaningController.php';
require_once __DIR__ . '/controllers/InvoiceController.php';
require_once __DIR__ . '/controllers/ReportController.php';

$db = Database::getInstance();

$method = $_SERVER['REQUEST_METHOD'];
$uri = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);

$input = json_decode(file_get_contents('php://input'), true) ?: [];

$response = ['success' => false, 'error' => 'Not Found', 'errorCode' => 'NOT_FOUND'];
$statusCode = 404;

try {
    if (strpos($uri, '/rooms') === 0 || strpos($uri, '/php-api/rooms') === 0) {
        $roomController = new RoomController($db);
        $roomId = null;
        
        if (preg_match('#/rooms/(\d+)/lock$#', $uri, $matches) || 
            preg_match('#/php-api/rooms/(\d+)/lock$#', $uri, $matches)) {
            $roomId = (int)$matches[1];
            if ($method === 'POST') {
                $response = $roomController->lock($roomId, $input);
                $statusCode = $response['success'] ? 200 : 400;
            }
        } elseif (preg_match('#/rooms/(\d+)/unlock$#', $uri, $matches) || 
                  preg_match('#/php-api/rooms/(\d+)/unlock$#', $uri, $matches)) {
            $roomId = (int)$matches[1];
            if ($method === 'POST') {
                $response = $roomController->unlock($roomId);
                $statusCode = $response['success'] ? 200 : 400;
            }
        } elseif (preg_match('#/rooms/(\d+)$#', $uri, $matches) || 
                  preg_match('#/php-api/rooms/(\d+)$#', $uri, $matches)) {
            $roomId = (int)$matches[1];
            if ($method === 'GET') {
                $response = $roomController->getById($roomId);
                $statusCode = $response['success'] ? 200 : 404;
            } elseif ($method === 'PATCH') {
                $response = $roomController->updateStatus($roomId, $input);
                $statusCode = $response['success'] ? 200 : 400;
            }
        } elseif (strpos($uri, '/rooms/availability') === 0 || 
                  strpos($uri, '/php-api/rooms/availability') === 0) {
            if ($method === 'GET') {
                $response = $roomController->getAvailability($_GET);
                $statusCode = 200;
            }
        } elseif (strpos($uri, '/rooms') === 0 || 
                  strpos($uri, '/php-api/rooms') === 0) {
            if ($method === 'GET') {
                $response = $roomController->getAll($_GET);
                $statusCode = 200;
            }
        }
    }
    
    elseif (strpos($uri, '/cleaning') === 0 || strpos($uri, '/php-api/cleaning') === 0) {
        $cleaningController = new CleaningController($db);
        $taskId = null;
        
        if (preg_match('#/cleaning/(\d+)$#', $uri, $matches) || 
            preg_match('#/php-api/cleaning/(\d+)$#', $uri, $matches)) {
            $taskId = (int)$matches[1];
            if ($method === 'GET') {
                $response = $cleaningController->getById($taskId);
                $statusCode = $response['success'] ? 200 : 404;
            } elseif ($method === 'PATCH') {
                $response = $cleaningController->updateStatus($taskId, $input);
                $statusCode = $response['success'] ? 200 : 400;
            }
        } elseif (strpos($uri, '/cleaning') === 0 || 
                  strpos($uri, '/php-api/cleaning') === 0) {
            if ($method === 'GET') {
                $response = $cleaningController->getAll($_GET);
                $statusCode = 200;
            } elseif ($method === 'POST') {
                $response = $cleaningController->create($input);
                $statusCode = $response['success'] ? 201 : 400;
            }
        }
    }
    
    elseif (strpos($uri, '/invoices') === 0 || strpos($uri, '/php-api/invoices') === 0) {
        $invoiceController = new InvoiceController($db);
        $invoiceId = null;
        
        if (preg_match('#/invoices/(\d+)$#', $uri, $matches) || 
            preg_match('#/php-api/invoices/(\d+)$#', $uri, $matches)) {
            $invoiceId = (int)$matches[1];
            if ($method === 'GET') {
                $response = $invoiceController->getById($invoiceId);
                $statusCode = $response['success'] ? 200 : 404;
            } elseif ($method === 'PATCH') {
                $response = $invoiceController->updateStatus($invoiceId, $input);
                $statusCode = $response['success'] ? 200 : 400;
            }
        } elseif (strpos($uri, '/invoices') === 0 || 
                  strpos($uri, '/php-api/invoices') === 0) {
            if ($method === 'GET') {
                $response = $invoiceController->getAll($_GET);
                $statusCode = 200;
            } elseif ($method === 'POST') {
                $response = $invoiceController->create($input);
                $statusCode = $response['success'] ? 201 : 400;
            }
        }
    }
    
    elseif (strpos($uri, '/reports') === 0 || strpos($uri, '/php-api/reports') === 0) {
        $reportController = new ReportController($db);
        
        if (strpos($uri, '/reports/occupancy') === 0 || 
            strpos($uri, '/php-api/reports/occupancy') === 0) {
            if ($method === 'GET') {
                $response = $reportController->getOccupancy($_GET);
                $statusCode = 200;
            }
        }
    }
    
    elseif ($uri === '/health' || $uri === '/' || 
            $uri === '/php-api/health' || $uri === '/php-api/') {
        $response = [
            'success' => true,
            'message' => '酒店PMS系统 PHP 后端运行正常',
            'timestamp' => date('c'),
            'stateMachine' => '已加载'
        ];
        $statusCode = 200;
    }
    
} catch (Exception $e) {
    $response = [
        'success' => false,
        'error' => '服务器内部错误',
        'errorCode' => 'INTERNAL_ERROR',
        'message' => $e->getMessage()
    ];
    $statusCode = 500;
    error_log("PHP Backend Error: " . $e->getMessage() . "\n" . $e->getTraceAsString());
}

http_response_code($statusCode);
echo json_encode($response, JSON_UNESCAPED_UNICODE);
